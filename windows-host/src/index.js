/**
 * Windows Host for Claude Chrome Bridge
 * Uses Chrome DevTools Protocol (CDP) to control Chrome
 */

const fs = require('fs');
const path = require('path');

const EARLY_LOG = 'C:\\Users\\Tony\\claude-bridge-startup.log';
fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] CDP Host starting, PID: ${process.pid}\n`);

const { WebSocketServer } = require('./websocket-server');
const { CDPClient } = require('./cdp-client');

const WS_PORT = 19222;
const CDP_PORT = 9222;
const LOG_FILE = path.join(process.env.TEMP || 'C:\\Temp', 'claude-chrome-bridge.log');

// Performance: Use buffered async logging instead of sync writes
const logBuffer = [];
let logFlushPending = false;
const LOG_FLUSH_INTERVAL = 1000; // Flush every 1 second
const LOG_BUFFER_MAX = 100; // Or when buffer reaches 100 entries

function flushLogBuffer() {
  if (logBuffer.length === 0) {
    logFlushPending = false;
    return;
  }
  const toWrite = logBuffer.splice(0, logBuffer.length).join('');
  fs.appendFile(LOG_FILE, toWrite, (err) => {
    if (err) console.error('Log write error:', err.message);
    logFlushPending = false;
    // Check if more logs accumulated during write
    if (logBuffer.length > 0) {
      scheduleFlush();
    }
  });
}

function scheduleFlush() {
  if (!logFlushPending) {
    logFlushPending = true;
    setImmediate(flushLogBuffer); // Use setImmediate for faster flushing
  }
}

// Log level filtering - set via LOG_LEVEL env var (debug, info, warn, error)
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

function log(level, message, data = null) {
  // Skip debug logs unless LOG_LEVEL=debug
  if (LOG_LEVELS[level] < currentLogLevel) return;

  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [CDP Host] [${level.toUpperCase()}] ${message}`;
  console.error(logLine);
  if (data && level !== 'debug') console.error(JSON.stringify(data, null, 2));

  // Buffer for async write
  const fileLog = data ? `${logLine}\n${JSON.stringify(data, null, 2)}\n` : `${logLine}\n`;
  logBuffer.push(fileLog);

  // Flush immediately on error, or schedule for others
  if (level === 'error' || logBuffer.length >= LOG_BUFFER_MAX) {
    flushLogBuffer();
  } else {
    scheduleFlush();
  }
}

class CDPHost {
  constructor() {
    this.wsServer = new WebSocketServer(WS_PORT);
    this.cdp = new CDPClient(CDP_PORT);
    this.clients = new Map(); // clientId -> client
    this.requestToClient = new Map(); // requestId -> clientId
    this.clientCounter = 0;
    this.chromeConnected = false;
  }

  async start() {
    log('info', 'Starting CDP Host...');
    fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] Starting CDP Host\n`);

    // Test Chrome connection
    try {
      const tabs = await this.cdp.getTabsInfo();
      this.chromeConnected = true;
      log('info', `Connected to Chrome, found ${tabs.length} tabs`);
      fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] Chrome connected, ${tabs.length} tabs\n`);
    } catch (e) {
      log('warn', `Chrome not available: ${e.message}`);
      fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] Chrome not available: ${e.message}\n`);
    }

    // Set up WebSocket server for WSL connections (supports multiple clients)
    this.wsServer.onConnection((client) => {
      const clientId = ++this.clientCounter;
      this.clients.set(clientId, client);
      log('info', `WSL bridge connected (client ${clientId}, total: ${this.clients.size})`);

      client.onMessage(async (message) => {
        log('debug', 'Received from WSL', { clientId, id: message.id, method: message.payload?.method });
        // Track which client sent this request
        this.requestToClient.set(String(message.id), clientId);
        await this.handleToolCall(message);
      });

      client.onClose(() => {
        log('info', `WSL bridge disconnected (client ${clientId}, remaining: ${this.clients.size - 1})`);
        this.clients.delete(clientId);
        // Clean up any pending requests from this client
        for (const [reqId, cId] of this.requestToClient) {
          if (cId === clientId) {
            this.requestToClient.delete(reqId);
          }
        }
      });

      client.onError((error) => {
        log('error', `WebSocket client ${clientId} error`, { error: error.message });
      });
    });

    this.wsServer.onError((error) => {
      log('error', 'WebSocket server error', { error: error.message });
    });

    this.wsServer.start();
    log('info', `WebSocket server listening on port ${WS_PORT}`);
    fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] WebSocket server started on ${WS_PORT}\n`);
  }

  async handleToolCall(bridgeMessage) {
    const startTime = Date.now();
    const payload = bridgeMessage.payload;
    const toolName = payload?.params?.name || payload?.tool;
    const args = payload?.params?.arguments || payload?.arguments || {};

    log('debug', `Tool call: ${toolName}`, args);

    try {
      let result;

      switch (toolName) {
        case 'tabs_context_mcp':
          result = await this.handleTabsContext(args);
          break;
        case 'tabs_create_mcp':
          result = await this.handleCreateTab(args);
          break;
        case 'navigate':
          result = await this.handleNavigate(args);
          break;
        case 'computer':
          result = await this.handleComputer(args);
          break;
        case 'read_page':
          result = await this.handleReadPage(args);
          break;
        case 'get_page_text':
          result = await this.handleGetPageText(args);
          break;
        case 'javascript_tool':
          result = await this.handleJavaScript(args);
          break;
        case 'find':
          result = await this.handleFind(args);
          break;
        case 'form_input':
          result = await this.handleFormInput(args);
          break;
        // Phase 1: Network/Cookies
        case 'cookies_get':
          result = await this.handleCookiesGet(args);
          break;
        case 'cookies_set':
          result = await this.handleCookiesSet(args);
          break;
        case 'cookies_delete':
          result = await this.handleCookiesDelete(args);
          break;
        case 'cookies_clear':
          result = await this.handleCookiesClear(args);
          break;
        case 'network_headers':
          result = await this.handleNetworkHeaders(args);
          break;
        case 'network_cache':
          result = await this.handleNetworkCache(args);
          break;
        case 'network_block':
          result = await this.handleNetworkBlock(args);
          break;
        case 'page_reload':
          result = await this.handlePageReload(args);
          break;
        case 'page_wait_for_load':
          result = await this.handlePageWaitForLoad(args);
          break;
        case 'page_wait_for_network_idle':
          result = await this.handlePageWaitForNetworkIdle(args);
          break;
        case 'network_wait_for_response':
          result = await this.handleNetworkWaitForResponse(args);
          break;
        // Phase 2: DOM
        case 'element_query':
          result = await this.handleElementQuery(args);
          break;
        case 'element_query_all':
          result = await this.handleElementQueryAll(args);
          break;
        case 'element_scroll_into_view':
          result = await this.handleElementScrollIntoView(args);
          break;
        case 'element_box_model':
          result = await this.handleElementBoxModel(args);
          break;
        case 'element_focus':
          result = await this.handleElementFocus(args);
          break;
        case 'element_html':
          result = await this.handleElementHTML(args);
          break;
        // Phase 3: Dialogs/Files
        case 'dialog_handle':
          result = await this.handleDialogHandle(args);
          break;
        case 'dialog_wait':
          result = await this.handleDialogWait(args);
          break;
        case 'file_upload':
          result = await this.handleFileUpload(args);
          break;
        case 'file_chooser_wait':
          result = await this.handleFileChooserWait(args);
          break;
        // Phase 4: Emulation
        case 'emulate_device':
          result = await this.handleEmulateDevice(args);
          break;
        case 'emulate_geolocation':
          result = await this.handleEmulateGeolocation(args);
          break;
        case 'emulate_timezone':
          result = await this.handleEmulateTimezone(args);
          break;
        case 'emulate_user_agent':
          result = await this.handleEmulateUserAgent(args);
          break;
        // Phase 5: Console/Performance
        case 'console_enable':
          result = await this.handleConsoleEnable(args);
          break;
        case 'console_messages':
          result = await this.handleConsoleMessages(args);
          break;
        case 'console_clear':
          result = await this.handleConsoleClear(args);
          break;
        case 'performance_metrics':
          result = await this.handlePerformanceMetrics(args);
          break;
        case 'page_layout_metrics':
          result = await this.handlePageLayoutMetrics(args);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      const elapsed = Date.now() - startTime;
      log('info', `[PERF] Tool ${toolName} completed in ${elapsed}ms`);
      this.sendResponse(bridgeMessage.id, result);
    } catch (error) {
      const elapsed = Date.now() - startTime;
      log('error', `Tool ${toolName} failed after ${elapsed}ms: ${error.message}\n${error.stack}`);
      this.sendError(bridgeMessage.id, error.message);
    }
  }

  async handleTabsContext(args) {
    // Refresh Chrome connection
    try {
      const tabs = await this.cdp.getTabsInfo();
      this.chromeConnected = true;

      if (tabs.length === 0 && args.createIfEmpty) {
        const newTab = await this.cdp.createTab();
        return {
          tabs: [{
            id: newTab.id,
            title: newTab.title || 'New Tab',
            url: newTab.url || 'about:blank'
          }],
          activeTabId: newTab.id
        };
      }

      return {
        tabs: tabs,
        activeTabId: tabs[0]?.id
      };
    } catch (e) {
      this.chromeConnected = false;
      throw new Error(`Chrome not available: ${e.message}. Start Chrome with --remote-debugging-port=9222`);
    }
  }

  async handleCreateTab(args) {
    const tab = await this.cdp.createTab(args.url);
    return { id: tab.id, url: tab.url, title: tab.title };
  }

  async handleNavigate(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    }
    const result = await this.cdp.navigate(args.url);
    return { success: true, frameId: result.frameId };
  }

  async handleComputer(args) {
    const action = args.action;

    switch (action) {
      case 'screenshot':
        if (args.tabId) {
          await this.cdp.connectToTarget(args.tabId);
        } else if (!this.cdp.ws) {
          await this.cdp.connectToTarget();
        }
        const screenshot = await this.cdp.takeScreenshot();
        return {
          type: 'image',
          data: screenshot,
          mediaType: 'image/png'
        };

      case 'left_click':
      case 'click':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        await this.cdp.click(args.coordinate[0], args.coordinate[1]);
        return { success: true };

      case 'double_click':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        await this.cdp.click(args.coordinate[0], args.coordinate[1]);
        await this.cdp.click(args.coordinate[0], args.coordinate[1]);
        return { success: true };

      case 'type':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        await this.cdp.type(args.text);
        return { success: true };

      case 'key':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        await this.cdp.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: args.text
        });
        await this.cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: args.text
        });
        return { success: true };

      case 'scroll':
        if (args.tabId) await this.cdp.connectToTarget(args.tabId);
        else if (!this.cdp.ws) await this.cdp.connectToTarget();
        const x = args.coordinate?.[0] || 0;
        const y = args.coordinate?.[1] || 0;
        await this.cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x, y,
          deltaX: 0,
          deltaY: args.delta || -100
        });
        return { success: true };

      case 'wait':
        await new Promise(resolve => setTimeout(resolve, args.duration || 1000));
        return { success: true };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async handleReadPage(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    // Get accessibility tree
    const result = await this.cdp.send('Accessibility.getFullAXTree');
    return { tree: result.nodes?.slice(0, 100) || [] }; // Limit for size
  }

  async handleGetPageText(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    const text = await this.cdp.executeScript('document.body.innerText');
    return { text };
  }

  async handleJavaScript(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    const result = await this.cdp.executeScript(args.text);
    return { result };
  }

  async handleFind(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    const script = `
      (function() {
        const query = ${JSON.stringify(args.query)};
        const elements = document.querySelectorAll(query);
        return Array.from(elements).slice(0, 10).map((el, i) => ({
          ref: 'element-' + i,
          tag: el.tagName,
          text: el.innerText?.substring(0, 100),
          value: el.value
        }));
      })()
    `;

    const result = await this.cdp.executeScript(script);
    return { elements: result || [] };
  }

  async handleFormInput(args) {
    if (args.tabId) {
      await this.cdp.connectToTarget(args.tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }

    const script = `
      (function() {
        const ref = ${JSON.stringify(args.ref)};
        const value = ${JSON.stringify(args.value)};
        const index = parseInt(ref.replace('element-', ''));
        const elements = document.querySelectorAll('input, textarea, select');
        if (elements[index]) {
          elements[index].value = value;
          elements[index].dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      })()
    `;

    const result = await this.cdp.executeScript(script);
    return { success: result };
  }

  // ============================================
  // Phase 1: Network/Cookies Handlers
  // ============================================

  async handleCookiesGet(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.getCookies(args.urls || []);
    return { cookies: result.cookies };
  }

  async handleCookiesSet(args) {
    await this.ensureConnected(args.tabId);
    const cookies = Array.isArray(args.cookies) ? args.cookies : [args.cookies];
    await this.cdp.setCookies(cookies);
    return { success: true, count: cookies.length };
  }

  async handleCookiesDelete(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.deleteCookies(args.name, {
      url: args.url,
      domain: args.domain,
      path: args.path
    });
    return { success: true };
  }

  async handleCookiesClear(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.clearBrowserCookies();
    return { success: true };
  }

  async handleNetworkHeaders(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.setExtraHTTPHeaders(args.headers);
    return { success: true };
  }

  async handleNetworkCache(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.setCacheDisabled(args.disabled !== false);
    return { success: true, cacheDisabled: args.disabled !== false };
  }

  async handleNetworkBlock(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.setBlockedURLs(args.urls || []);
    return { success: true, blockedUrls: args.urls || [] };
  }

  async handlePageReload(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.reload({
      ignoreCache: args.ignoreCache || false,
      scriptToEvaluateOnLoad: args.scriptToEvaluateOnLoad
    });
    return { success: true };
  }

  async handlePageWaitForLoad(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.waitForLoad({
      waitUntil: args.waitUntil || 'load',
      timeoutMs: args.timeoutMs || 30000
    });
    return { success: true, event: result };
  }

  async handlePageWaitForNetworkIdle(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.waitForNetworkIdle({
      idleMs: args.idleMs || 500,
      timeoutMs: args.timeoutMs || 30000,
      maxInflight: args.maxInflight || 0
    });
    return { success: true, idleTime: result.idleTime };
  }

  async handleNetworkWaitForResponse(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.waitForResponse({
      url: args.url,
      urlRegex: args.urlRegex,
      method: args.method,
      status: args.status,
      resourceType: args.resourceType,
      timeoutMs: args.timeoutMs || 30000
    });
    return {
      requestId: result.requestId,
      url: result.response?.url,
      status: result.response?.status,
      headers: result.response?.headers
    };
  }

  // ============================================
  // Phase 2: DOM Handlers
  // ============================================

  async handleElementQuery(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.querySelector(args.selector, args.nodeId);
    return {
      nodeId: result.nodeId,
      selector: result.selector,
      docVersion: result.docVersion,
      found: result.nodeId !== 0
    };
  }

  async handleElementQueryAll(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.querySelectorAll(args.selector, args.nodeId);
    return {
      nodeIds: result.nodeIds,
      selector: result.selector,
      docVersion: result.docVersion,
      count: result.nodeIds.length
    };
  }

  async handleElementScrollIntoView(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.scrollIntoViewIfNeeded(args.nodeId);
    return { success: true };
  }

  async handleElementBoxModel(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.getBoxModel(args.nodeId);
    return { model: result.model };
  }

  async handleElementFocus(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.focusElement(args.nodeId);
    return { success: true };
  }

  async handleElementHTML(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.getOuterHTML(args.nodeId);
    return { outerHTML: result.outerHTML };
  }

  // ============================================
  // Phase 3: Dialogs/Files Handlers
  // ============================================

  async handleDialogHandle(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.handleJavaScriptDialog(
      args.accept !== false,
      args.promptText
    );
    return { success: true };
  }

  async handleDialogWait(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.waitForDialog({
      timeoutMs: args.timeoutMs || 30000,
      autoHandle: args.autoHandle,
      action: args.action || 'dismiss',
      promptText: args.promptText
    });
    return result;
  }

  async handleFileUpload(args) {
    await this.ensureConnected(args.tabId);

    // Convert WSL paths to Windows paths
    const { CDPClient } = require('./cdp-client');
    const windowsFiles = (args.files || []).map(f => CDPClient.toWindowsPath(f));

    await this.cdp.setFileInputFiles(
      windowsFiles,
      args.nodeId,
      args.backendNodeId
    );
    return { success: true, files: windowsFiles };
  }

  async handleFileChooserWait(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.waitForFileChooser({
      timeoutMs: args.timeoutMs || 30000
    });
    return result;
  }

  // ============================================
  // Phase 4: Emulation Handlers
  // ============================================

  async handleEmulateDevice(args) {
    await this.ensureConnected(args.tabId);

    if (args.clear) {
      await this.cdp.clearDeviceMetricsOverride();
      return { success: true, cleared: true };
    }

    await this.cdp.setDeviceMetricsOverride({
      width: args.width || 1920,
      height: args.height || 1080,
      deviceScaleFactor: args.deviceScaleFactor || 1,
      mobile: args.mobile || false,
      screenOrientation: args.screenOrientation
    });

    if (args.touch !== undefined) {
      await this.cdp.setTouchEmulationEnabled(args.touch, args.maxTouchPoints || 1);
    }

    return { success: true };
  }

  async handleEmulateGeolocation(args) {
    await this.ensureConnected(args.tabId);

    if (args.clear) {
      await this.cdp.clearGeolocationOverride();
      return { success: true, cleared: true };
    }

    await this.cdp.setGeolocationOverride(
      args.latitude,
      args.longitude,
      args.accuracy || 100
    );
    return { success: true };
  }

  async handleEmulateTimezone(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.setTimezoneOverride(args.timezoneId);
    return { success: true };
  }

  async handleEmulateUserAgent(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.setUserAgentOverride(args.userAgent, {
      platform: args.platform,
      acceptLanguage: args.acceptLanguage
    });
    return { success: true };
  }

  // ============================================
  // Phase 5: Console/Performance Handlers
  // ============================================

  async handleConsoleEnable(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.enableConsole();
    if (args.enableLog) {
      await this.cdp.enableLog();
    }
    return { success: true };
  }

  async handleConsoleMessages(args) {
    await this.ensureConnected(args.tabId);
    const messages = this.cdp.getConsoleMessages(args.since || 0);
    const logEntries = args.includeLogs ? this.cdp.getLogEntries(args.since || 0) : [];
    return { messages, logEntries };
  }

  async handleConsoleClear(args) {
    await this.ensureConnected(args.tabId);
    await this.cdp.clearConsole();
    this.cdp.clearEventQueue();
    return { success: true };
  }

  async handlePerformanceMetrics(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.getPerformanceMetrics();
    return { metrics: result.metrics };
  }

  async handlePageLayoutMetrics(args) {
    await this.ensureConnected(args.tabId);
    const result = await this.cdp.getLayoutMetrics();
    return result;
  }

  // Helper to ensure connection
  async ensureConnected(tabId) {
    if (tabId !== undefined && tabId !== null) {
      await this.cdp.connectToTarget(tabId);
    } else if (!this.cdp.ws) {
      await this.cdp.connectToTarget();
    }
  }

  sendResponse(id, result) {
    const clientId = this.requestToClient.get(String(id));
    const client = clientId ? this.clients.get(clientId) : null;

    log('debug', `Sending response for ${id} to client ${clientId}`, { hasResult: !!result });

    if (!client) {
      log('warn', `No client found for request ${id}`);
      return;
    }

    this.requestToClient.delete(String(id));

    client.send({
      id,
      direction: 'from-chrome',
      timestamp: Date.now(),
      payload: {
        requestId: id,
        result
      }
    });
  }

  sendError(id, error) {
    const clientId = this.requestToClient.get(String(id));
    const client = clientId ? this.clients.get(clientId) : null;

    if (!client) {
      log('warn', `No client found for error response ${id}`);
      return;
    }

    this.requestToClient.delete(String(id));

    client.send({
      id,
      direction: 'from-chrome',
      timestamp: Date.now(),
      payload: {
        requestId: id,
        error
      }
    });
  }
}

// Start the host
const host = new CDPHost();
host.start().catch(err => {
  fs.appendFileSync(EARLY_LOG, `[${new Date().toISOString()}] ERROR: ${err.message}\n`);
  console.error('Failed to start:', err);
});

// Keep alive
setInterval(() => {}, 60000);
