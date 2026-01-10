/**
 * Chrome DevTools Protocol (CDP) Client
 * Connects to Chrome's remote debugging port and executes browser commands
 */

const WebSocket = require('ws');
const http = require('http');

class CDPClient {
  constructor(port = 9222) {
    this.port = port;
    this.ws = null;
    this.messageId = 0;
    this.pendingCommands = new Map();
    this.targetId = null;
    this.sessionId = null;

    // Event handling infrastructure
    this.eventListeners = new Map(); // method -> Set<callback>
    this.eventQueue = [];
    this.maxQueueSize = 1000;
    this.domainsEnabled = new Set();
    this.docVersion = 0; // Track DOM document version for nodeId invalidation
    this.rootNodeId = null;

    // Network request tracking for getResponseBody
    this.networkRequests = new Map(); // requestId -> { url, method, timestamp }
    this.maxNetworkRequests = 500;
  }

  // Register an event listener
  on(method, callback) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, new Set());
    }
    this.eventListeners.get(method).add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(method);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  // Remove an event listener
  off(method, callback) {
    const listeners = this.eventListeners.get(method);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  // Emit an event to all listeners
  emitEvent(method, params) {
    const listeners = this.eventListeners.get(method);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(params);
        } catch (e) {
          console.error(`Event listener error for ${method}:`, e);
        }
      }
    }

    // Also emit to wildcard listeners
    const wildcardListeners = this.eventListeners.get('*');
    if (wildcardListeners) {
      for (const callback of wildcardListeners) {
        try {
          callback({ method, params });
        } catch (e) {
          console.error(`Wildcard listener error:`, e);
        }
      }
    }

    // Buffer event in queue (bounded)
    if (this.eventQueue.length >= this.maxQueueSize) {
      this.eventQueue.shift(); // Remove oldest
    }
    this.eventQueue.push({ method, params, timestamp: Date.now() });
  }

  // Wait for a specific event with optional filter
  waitForEvent(method, { timeoutMs = 30000, filter } = {}) {
    return new Promise((resolve, reject) => {
      const off = this.on(method, (params) => {
        if (filter && !filter(params)) return;
        clearTimeout(timer);
        off();
        resolve(params);
      });

      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timeout waiting for ${method}`));
      }, timeoutMs);
    });
  }

  // Get buffered events, optionally filtered
  getBufferedEvents(method = null, since = 0) {
    return this.eventQueue.filter(evt =>
      (!method || evt.method === method) && evt.timestamp > since
    );
  }

  // Clear event queue
  clearEventQueue() {
    this.eventQueue = [];
  }

  // Get list of available targets (tabs) from Chrome
  // Sorted by ID for consistent ordering (Chrome's /json/list order is not stable)
  async getTargets() {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${this.port}/json/list`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const targets = JSON.parse(data);
            // Sort by ID for consistent ordering across calls
            targets.sort((a, b) => a.id.localeCompare(b.id));
            resolve(targets);
          } catch (e) {
            reject(new Error(`Failed to parse targets: ${e.message}`));
          }
        });
      });
      req.on('error', (e) => reject(new Error(`Failed to connect to Chrome: ${e.message}. Is Chrome running with --remote-debugging-port=${this.port}?`)));
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }

  // Connect to a specific target (tab)
  // targetId can be:
  //   - number: index into page targets (0 = first tab, 1 = second tab, etc.)
  //   - string: exact Chrome target UUID
  //   - undefined/null: first available page target
  async connectToTarget(targetId, options = {}) {
    // PERFORMANCE FIX: Check if already connected BEFORE making HTTP call
    // This saves ~10-50ms per tool call when connection is already established
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // For numeric indexes, we must fetch targets to resolve the index
      // For string IDs or no ID, we can use cached connection
      if (targetId === undefined || targetId === null ||
          (typeof targetId === 'string' && this.targetId === targetId)) {
        return { id: this.targetId, cached: true };
      }
    }

    const targets = await this.getTargets();
    const pageTargets = targets.filter(t => t.type === 'page');

    let target;
    if (typeof targetId === 'number') {
      // Numeric ID: treat as index into page targets (0 = first, 1 = second, etc.)
      if (targetId < 0 || targetId >= pageTargets.length) {
        throw new Error(`Tab index ${targetId} out of range (${pageTargets.length} tabs available)`);
      }
      target = pageTargets[targetId];
    } else if (targetId) {
      // String ID: exact UUID match
      target = targets.find(t => t.id === targetId);
    } else {
      // No ID: first page target
      target = pageTargets[0];
    }

    if (!target) {
      throw new Error('No suitable target found');
    }

    // Double-check after HTTP call (race condition prevention)
    if (this.ws && this.targetId === target.id && this.ws.readyState === WebSocket.OPEN) {
      return target;
    }

    // Disconnect from previous target if different
    if (this.ws && this.targetId !== target.id) {
      this.disconnect();
    }

    this.targetId = target.id;

    await new Promise((resolve, reject) => {
      const newWs = new WebSocket(target.webSocketDebuggerUrl);
      this.ws = newWs;

      newWs.on('open', () => {
        resolve(target);
      });

      newWs.on('message', (data) => {
        this.handleMessage(JSON.parse(data.toString()));
      });

      newWs.on('error', (err) => {
        reject(err);
      });

      newWs.on('close', () => {
        // Only clear state if this is still the active WebSocket
        // (prevents old WebSocket close events from clearing new connections)
        if (this.ws === newWs) {
          this.ws = null;
          this.targetId = null;
          this.domainsEnabled.clear();
          this.docVersion = 0;
          this.rootNodeId = null;
          // Clear stale event data to prevent memory leaks and stale matches
          this.eventListeners.clear();
          this.eventQueue = [];
          this.networkRequests.clear();
        }
      });
    });

    // Enable essential domains unless skipDomainEnable is set
    if (!options.skipDomainEnable) {
      await this.enableDomains();
    }

    return target;
  }

  // Enable CDP domains for event subscriptions
  async enableDomains() {
    const domains = ['Page', 'Runtime', 'Network', 'DOM'];

    for (const domain of domains) {
      if (!this.domainsEnabled.has(domain)) {
        try {
          if (domain === 'Network') {
            // Use buffer size params for Network domain
            await this.send('Network.enable', {
              maxResourceBufferSize: 10000000,  // 10MB
              maxTotalBufferSize: 50000000      // 50MB
            });
          } else {
            await this.send(`${domain}.enable`);
          }
          this.domainsEnabled.add(domain);
        } catch (e) {
          console.error(`Failed to enable ${domain} domain:`, e.message);
        }
      }
    }

    // Enable lifecycle events for wait helpers
    if (this.domainsEnabled.has('Page')) {
      try {
        await this.send('Page.setLifecycleEventsEnabled', { enabled: true });
      } catch (e) {
        console.error('Failed to enable lifecycle events:', e.message);
      }
    }
  }

  // Enable a specific domain
  async enableDomain(domain) {
    if (this.domainsEnabled.has(domain)) {
      return;
    }

    try {
      await this.send(`${domain}.enable`);
      this.domainsEnabled.add(domain);
    } catch (e) {
      throw new Error(`Failed to enable ${domain}: ${e.message}`);
    }
  }

  handleMessage(message) {
    // Handle command responses
    if (message.id !== undefined && this.pendingCommands.has(message.id)) {
      const { resolve, reject } = this.pendingCommands.get(message.id);
      this.pendingCommands.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
      return;
    }

    // Handle CDP events (no id, has method)
    if (message.method) {
      this.emitEvent(message.method, message.params || {});

      // Track DOM document version changes
      if (message.method === 'DOM.documentUpdated') {
        this.docVersion++;
        this.rootNodeId = null;
      }
      if (message.method === 'Page.frameNavigated' && !message.params?.frame?.parentId) {
        this.docVersion++;
        this.rootNodeId = null;
      }

      // Track network requests for getResponseBody
      if (message.method === 'Network.requestWillBeSent') {
        const { requestId, request } = message.params;
        if (this.networkRequests.size >= this.maxNetworkRequests) {
          // Remove oldest entry
          const oldestKey = this.networkRequests.keys().next().value;
          this.networkRequests.delete(oldestKey);
        }
        this.networkRequests.set(requestId, {
          url: request.url,
          method: request.method,
          timestamp: Date.now()
        });
      }
      if (message.method === 'Network.loadingFinished' || message.method === 'Network.loadingFailed') {
        // Keep the request info for a bit longer (for getResponseBody)
        const reqInfo = this.networkRequests.get(message.params.requestId);
        if (reqInfo) {
          reqInfo.finished = true;
          reqInfo.finishedAt = Date.now();
        }
      }
    }
  }

  // Send a CDP command
  async send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Chrome');
    }

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      this.pendingCommands.set(id, { resolve, reject });

      this.ws.send(JSON.stringify({
        id,
        method,
        params
      }));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command ${method} timed out`));
        }
      }, 30000);
    });
  }

  // High-level browser operations

  async getTabsInfo() {
    const targets = await this.getTargets();
    return targets
      .filter(t => t.type === 'page')
      .map(t => ({
        id: t.id,
        title: t.title,
        url: t.url
      }));
  }

  async navigate(url) {
    if (!this.ws) {
      await this.connectToTarget();
    }
    return await this.send('Page.navigate', { url });
  }

  async takeScreenshot(options = {}) {
    if (!this.ws) {
      await this.connectToTarget();
    }

    // Anthropic recommends XGA (1024x768) for computer use
    // https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo
    const TARGET_WIDTH = 1024;
    const TARGET_HEIGHT = 768;

    // Use JPEG for best compression
    const format = options.format || 'jpeg';
    const params = { format };

    // Quality 70 for good readability (file saved to disk, not base64)
    if (format !== 'png') {
      params.quality = options.quality || 70;
    }

    params.captureBeyondViewport = false;
    params.optimizeForSpeed = true;

    // Get current viewport dimensions
    const layoutMetrics = await this.send('Page.getLayoutMetrics');
    const viewport = layoutMetrics.cssLayoutViewport || layoutMetrics.layoutViewport;
    const currentWidth = viewport.clientWidth || 1920;
    const currentHeight = viewport.clientHeight || 1080;

    // Calculate scale to fit within XGA while preserving aspect ratio
    const scaleX = TARGET_WIDTH / currentWidth;
    const scaleY = TARGET_HEIGHT / currentHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Never scale up

    // Use clip with scale factor for efficient downscaling
    params.clip = {
      x: 0,
      y: 0,
      width: currentWidth,
      height: currentHeight,
      scale: scale
    };

    const result = await this.send('Page.captureScreenshot', params);

    return {
      data: result.data,
      format,
      width: Math.round(currentWidth * scale),
      height: Math.round(currentHeight * scale),
      scale
    };
  }

  async getPageContent() {
    if (!this.ws) {
      await this.connectToTarget();
    }

    const result = await this.send('Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML'
    });

    return result.result.value;
  }

  async executeScript(script) {
    if (!this.ws) {
      await this.connectToTarget();
    }

    const result = await this.send('Runtime.evaluate', {
      expression: script,
      returnByValue: true
    });

    if (result.exceptionDetails) {
      // Extract detailed error information from CDP exception
      const details = result.exceptionDetails;
      const exception = details.exception;
      const errorMessage = exception?.description || exception?.value || details.text || 'Unknown error';
      const lineInfo = details.lineNumber !== undefined ? ` (line ${details.lineNumber + 1})` : '';
      throw new Error(`${errorMessage}${lineInfo}`);
    }

    return result.result.value;
  }

  async click(x, y) {
    if (!this.ws) {
      await this.connectToTarget();
    }

    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x, y,
      button: 'left',
      clickCount: 1
    });

    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x, y,
      button: 'left',
      clickCount: 1
    });
  }

  async type(text) {
    if (!this.ws) {
      await this.connectToTarget();
    }

    for (const char of text) {
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char
      });
    }
  }

  async createTab(url) {
    return new Promise((resolve, reject) => {
      // Chrome's /json/new endpoint requires PUT method
      const endpoint = url
        ? `/json/new?${encodeURIComponent(url)}`
        : `/json/new`;

      const options = {
        hostname: 'localhost',
        port: this.port,
        path: endpoint,
        method: 'PUT'
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to create tab: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  async closeTab(targetId) {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${this.port}/json/close/${targetId}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
    });
  }

  // ============================================
  // Phase 1: Network/Cookies & Navigation
  // ============================================

  async getCookies(urls = []) {
    return await this.send('Network.getCookies', urls.length ? { urls } : {});
  }

  async setCookies(cookies) {
    // cookies is an array of { name, value, domain, path, secure, httpOnly, sameSite, expires }
    return await this.send('Network.setCookies', { cookies });
  }

  async deleteCookies(name, options = {}) {
    // options: { url, domain, path }
    return await this.send('Network.deleteCookies', { name, ...options });
  }

  async clearBrowserCookies() {
    return await this.send('Network.clearBrowserCookies');
  }

  async setExtraHTTPHeaders(headers) {
    // headers is an object: { "Header-Name": "value" }
    return await this.send('Network.setExtraHTTPHeaders', { headers });
  }

  async setCacheDisabled(disabled = true) {
    return await this.send('Network.setCacheDisabled', { cacheDisabled: disabled });
  }

  async setBlockedURLs(urls) {
    // urls is an array of URL patterns to block
    return await this.send('Network.setBlockedURLs', { urls });
  }

  async getResponseBody(requestId) {
    return await this.send('Network.getResponseBody', { requestId });
  }

  async reload(options = {}) {
    // options: { ignoreCache, scriptToEvaluateOnLoad }
    return await this.send('Page.reload', {
      ignoreCache: options.ignoreCache || false,
      scriptToEvaluateOnLoad: options.scriptToEvaluateOnLoad
    });
  }

  async bringToFront() {
    return await this.send('Page.bringToFront');
  }

  async getLayoutMetrics() {
    return await this.send('Page.getLayoutMetrics');
  }

  // Wait for page load event
  async waitForLoad(options = {}) {
    const { waitUntil = 'load', timeoutMs = 30000 } = options;

    if (waitUntil === 'domcontentloaded') {
      return await this.waitForEvent('Page.lifecycleEvent', {
        timeoutMs,
        filter: (params) => params.name === 'DOMContentLoaded'
      });
    } else {
      return await this.waitForEvent('Page.lifecycleEvent', {
        timeoutMs,
        filter: (params) => params.name === 'load'
      });
    }
  }

  // Wait for network to be idle
  async waitForNetworkIdle(options = {}) {
    const { idleMs = 500, timeoutMs = 30000, maxInflight = 0 } = options;

    return new Promise((resolve, reject) => {
      let inflight = 0;
      let idleTimer = null;
      const timeoutTimer = setTimeout(() => {
        cleanup();
        reject(new Error('Network idle timeout'));
      }, timeoutMs);

      const checkIdle = () => {
        if (inflight <= maxInflight) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            cleanup();
            resolve({ idleTime: Date.now() });
          }, idleMs);
        }
      };

      const offRequest = this.on('Network.requestWillBeSent', (params) => {
        // Ignore WebSocket connections that can keep network "busy"
        if (params.type !== 'WebSocket') {
          inflight++;
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
          }
        }
      });

      const offFinished = this.on('Network.loadingFinished', () => {
        inflight = Math.max(0, inflight - 1);
        checkIdle();
      });

      const offFailed = this.on('Network.loadingFailed', () => {
        inflight = Math.max(0, inflight - 1);
        checkIdle();
      });

      const cleanup = () => {
        clearTimeout(timeoutTimer);
        if (idleTimer) clearTimeout(idleTimer);
        offRequest();
        offFinished();
        offFailed();
      };

      // Start checking immediately
      checkIdle();
    });
  }

  // Wait for a specific network response
  async waitForResponse(options = {}) {
    const { url, urlRegex, method, status, resourceType, timeoutMs = 30000 } = options;

    // Pre-compile regex to catch invalid patterns early and avoid re-creating on each event
    let compiledRegex = null;
    if (urlRegex) {
      try {
        compiledRegex = new RegExp(urlRegex);
      } catch (e) {
        throw new Error(`Invalid urlRegex pattern: ${e.message}`);
      }
    }

    return await this.waitForEvent('Network.responseReceived', {
      timeoutMs,
      filter: (params) => {
        const response = params.response;
        if (url && !response.url.includes(url)) return false;
        if (compiledRegex && !compiledRegex.test(response.url)) return false;
        // Look up HTTP method from tracked requests (params.type is ResourceType, not HTTP method)
        if (method) {
          const reqInfo = this.networkRequests.get(params.requestId);
          if (!reqInfo || reqInfo.method !== method) return false;
        }
        if (status && response.status !== status) return false;
        if (resourceType && params.type !== resourceType) return false;
        return true;
      }
    });
  }

  // ============================================
  // Phase 2: DOM Operations
  // ============================================

  async getDocument(options = {}) {
    const { depth = -1, pierce = true } = options;
    const result = await this.send('DOM.getDocument', { depth, pierce });
    this.rootNodeId = result.root.nodeId;
    return result;
  }

  async querySelector(selector, nodeId = null) {
    // Get document if we don't have a root node
    if (!nodeId && !this.rootNodeId) {
      await this.getDocument();
    }
    const rootId = nodeId || this.rootNodeId;

    const result = await this.send('DOM.querySelector', {
      nodeId: rootId,
      selector
    });

    return { nodeId: result.nodeId, selector, docVersion: this.docVersion };
  }

  async querySelectorAll(selector, nodeId = null) {
    if (!nodeId && !this.rootNodeId) {
      await this.getDocument();
    }
    const rootId = nodeId || this.rootNodeId;

    const result = await this.send('DOM.querySelectorAll', {
      nodeId: rootId,
      selector
    });

    return { nodeIds: result.nodeIds, selector, docVersion: this.docVersion };
  }

  async getBoxModel(nodeId) {
    return await this.send('DOM.getBoxModel', { nodeId });
  }

  async scrollIntoViewIfNeeded(nodeId) {
    return await this.send('DOM.scrollIntoViewIfNeeded', { nodeId });
  }

  async focusElement(nodeId) {
    return await this.send('DOM.focus', { nodeId });
  }

  async getOuterHTML(nodeId) {
    return await this.send('DOM.getOuterHTML', { nodeId });
  }

  async setFileInputFiles(files, nodeId = null, backendNodeId = null) {
    const params = { files };
    if (nodeId) params.nodeId = nodeId;
    if (backendNodeId) params.backendNodeId = backendNodeId;
    return await this.send('DOM.setFileInputFiles', params);
  }

  // ============================================
  // Phase 3: Dialogs & File Chooser
  // ============================================

  async handleJavaScriptDialog(accept, promptText = null) {
    const params = { accept };
    if (promptText !== null) {
      params.promptText = promptText;
    }
    return await this.send('Page.handleJavaScriptDialog', params);
  }

  // Enable file chooser interception
  async setInterceptFileChooserDialog(enabled = true) {
    return await this.send('Page.setInterceptFileChooserDialog', { enabled });
  }

  // Wait for JavaScript dialog
  async waitForDialog(options = {}) {
    const { timeoutMs = 30000, autoHandle, action = 'dismiss', promptText } = options;

    const dialogParams = await this.waitForEvent('Page.javascriptDialogOpening', { timeoutMs });

    if (autoHandle) {
      await this.handleJavaScriptDialog(action === 'accept', promptText);
    }

    return {
      type: dialogParams.type,
      message: dialogParams.message,
      url: dialogParams.url,
      defaultPrompt: dialogParams.defaultPrompt,
      hasBrowserHandler: dialogParams.hasBrowserHandler
    };
  }

  // Wait for file chooser
  async waitForFileChooser(options = {}) {
    const { timeoutMs = 30000 } = options;

    // Make sure file chooser interception is enabled
    await this.setInterceptFileChooserDialog(true);

    const params = await this.waitForEvent('Page.fileChooserOpened', { timeoutMs });

    return {
      frameId: params.frameId,
      mode: params.mode,
      backendNodeId: params.backendNodeId
    };
  }

  // ============================================
  // Phase 4: Emulation
  // ============================================

  async setDeviceMetricsOverride(options) {
    const {
      width = 1920,
      height = 1080,
      deviceScaleFactor = 1,
      mobile = false,
      screenOrientation
    } = options;

    const params = {
      width,
      height,
      deviceScaleFactor,
      mobile
    };

    if (screenOrientation) {
      params.screenOrientation = screenOrientation;
    }

    return await this.send('Emulation.setDeviceMetricsOverride', params);
  }

  async clearDeviceMetricsOverride() {
    return await this.send('Emulation.clearDeviceMetricsOverride');
  }

  async setUserAgentOverride(userAgent, options = {}) {
    const params = { userAgent };
    if (options.platform) params.platform = options.platform;
    if (options.acceptLanguage) params.acceptLanguage = options.acceptLanguage;
    return await this.send('Emulation.setUserAgentOverride', params);
  }

  async setGeolocationOverride(latitude, longitude, accuracy = 100) {
    // Grant geolocation permission first
    try {
      await this.send('Browser.grantPermissions', {
        permissions: ['geolocation']
      });
    } catch (e) {
      // Browser.grantPermissions might not be available, continue anyway
    }

    return await this.send('Emulation.setGeolocationOverride', {
      latitude,
      longitude,
      accuracy
    });
  }

  async clearGeolocationOverride() {
    return await this.send('Emulation.clearGeolocationOverride');
  }

  async setTimezoneOverride(timezoneId) {
    return await this.send('Emulation.setTimezoneOverride', { timezoneId });
  }

  async setLocaleOverride(locale) {
    return await this.send('Emulation.setLocaleOverride', { locale });
  }

  async setTouchEmulationEnabled(enabled, maxTouchPoints = 1) {
    return await this.send('Emulation.setTouchEmulationEnabled', {
      enabled,
      maxTouchPoints
    });
  }

  // ============================================
  // Phase 5: Console & Performance
  // ============================================

  async enableConsole() {
    if (!this.domainsEnabled.has('Console')) {
      await this.send('Console.enable');
      this.domainsEnabled.add('Console');
    }
  }

  async enableLog() {
    if (!this.domainsEnabled.has('Log')) {
      await this.send('Log.enable');
      this.domainsEnabled.add('Log');
    }
  }

  async clearConsole() {
    return await this.send('Console.clearMessages');
  }

  // Get buffered console messages from event queue
  getConsoleMessages(since = 0) {
    const consoleEvents = this.getBufferedEvents('Console.messageAdded', since);
    return consoleEvents.map(evt => evt.params.message);
  }

  // Get buffered log entries from event queue
  getLogEntries(since = 0) {
    const logEvents = this.getBufferedEvents('Log.entryAdded', since);
    return logEvents.map(evt => evt.params.entry);
  }

  async enablePerformance() {
    if (!this.domainsEnabled.has('Performance')) {
      await this.send('Performance.enable');
      this.domainsEnabled.add('Performance');
    }
  }

  async getPerformanceMetrics() {
    await this.enablePerformance();
    return await this.send('Performance.getMetrics');
  }

  async disablePerformance() {
    if (this.domainsEnabled.has('Performance')) {
      await this.send('Performance.disable');
      this.domainsEnabled.delete('Performance');
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  // Convert WSL path to Windows path
  static toWindowsPath(posixPath) {
    if (posixPath.startsWith('/mnt/')) {
      const parts = posixPath.split('/');
      const drive = parts[2].toUpperCase();
      return `${drive}:\\${parts.slice(3).join('\\')}`;
    }
    // For non-/mnt paths, they would need to be staged to Windows temp
    // This is a basic implementation - full staging would copy the file
    return posixPath;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.eventListeners.clear();
    this.eventQueue = [];
    this.networkRequests.clear();
    this.domainsEnabled.clear();
  }
}

module.exports = { CDPClient };
