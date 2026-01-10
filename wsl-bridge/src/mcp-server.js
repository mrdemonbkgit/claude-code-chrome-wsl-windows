#!/usr/bin/env node

/**
 * MCP Server for Claude Chrome Bridge
 *
 * This is a stdio-based MCP server that Claude Code can connect to.
 * It provides browser automation tools by forwarding to the Windows Chrome extension.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Directory for saving screenshots
const SCREENSHOT_DIR = path.join(os.tmpdir(), 'claude-chrome-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const WS_PORT = 19222;

// Get Windows host IP
function getWindowsHostIP() {
  if (process.env.WINDOWS_HOST_IP) {
    return process.env.WINDOWS_HOST_IP;
  }

  // Try default gateway first (more reliable for WSL2)
  try {
    const { execSync } = require('child_process');
    const route = execSync('ip route | grep default', { encoding: 'utf8' });
    const match = route.match(/via\s+(\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  } catch (e) {
    // Ignore
  }

  // Fallback to resolv.conf
  try {
    const resolv = fs.readFileSync('/etc/resolv.conf', 'utf8');
    const match = resolv.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  } catch (e) {
    // Ignore
  }

  return '127.0.0.1';
}

const WS_HOST = getWindowsHostIP();
const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;

// Logging to stderr (stdout is for MCP protocol)
function log(message) {
  console.error(`[MCP Bridge] ${message}`);
}

// Browser automation tools that we expose
const BROWSER_TOOLS = [
  {
    name: 'computer',
    description: 'Control the browser with mouse and keyboard actions, take screenshots',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['screenshot', 'left_click', 'right_click', 'type', 'key', 'scroll', 'wait', 'double_click', 'triple_click'],
          description: 'The action to perform'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          description: 'x, y coordinates for click actions'
        },
        text: {
          type: 'string',
          description: 'Text to type or key to press'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to perform action on'
        }
      },
      required: ['action', 'tabId']
    }
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL in the browser',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        tabId: { type: 'number', description: 'Tab ID to navigate' }
      },
      required: ['url', 'tabId']
    }
  },
  {
    name: 'read_page',
    description: 'Get accessibility tree of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID to read' }
      },
      required: ['tabId']
    }
  },
  {
    name: 'tabs_context_mcp',
    description: 'Get information about browser tabs',
    inputSchema: {
      type: 'object',
      properties: {
        createIfEmpty: { type: 'boolean', description: 'Create tab if none exists' }
      }
    }
  },
  {
    name: 'tabs_create_mcp',
    description: 'Create a new browser tab',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'find',
    description: 'Find elements on the page',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to find' },
        tabId: { type: 'number', description: 'Tab ID to search' }
      },
      required: ['query', 'tabId']
    }
  },
  {
    name: 'form_input',
    description: 'Fill form fields',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Element reference' },
        value: { type: 'string', description: 'Value to set' },
        tabId: { type: 'number', description: 'Tab ID' }
      },
      required: ['ref', 'value', 'tabId']
    }
  },
  {
    name: 'get_page_text',
    description: 'Extract text content from page',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' }
      },
      required: ['tabId']
    }
  },
  {
    name: 'javascript_tool',
    description: 'Execute JavaScript in page context',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', const: 'javascript_exec' },
        text: { type: 'string', description: 'JavaScript code' },
        tabId: { type: 'number', description: 'Tab ID' }
      },
      required: ['action', 'text', 'tabId']
    }
  },
  // ============================================
  // Phase 1: Network/Cookies Tools
  // ============================================
  {
    name: 'cookies_get',
    description: 'Get cookies for the current page or specified URLs',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        urls: { type: 'array', items: { type: 'string' }, description: 'URLs to get cookies for (optional)' }
      }
    }
  },
  {
    name: 'cookies_set',
    description: 'Set one or more cookies',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        cookies: {
          oneOf: [
            {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'string' },
                domain: { type: 'string' },
                path: { type: 'string' },
                secure: { type: 'boolean' },
                httpOnly: { type: 'boolean' },
                sameSite: { type: 'string', enum: ['Strict', 'Lax', 'None'] },
                expires: { type: 'number', description: 'Unix timestamp' }
              },
              required: ['name', 'value']
            },
            {
              type: 'array',
              items: { type: 'object' }
            }
          ],
          description: 'Cookie or array of cookies to set'
        }
      },
      required: ['cookies']
    }
  },
  {
    name: 'cookies_delete',
    description: 'Delete a specific cookie',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        name: { type: 'string', description: 'Cookie name to delete' },
        url: { type: 'string', description: 'URL to scope deletion' },
        domain: { type: 'string', description: 'Domain to scope deletion' },
        path: { type: 'string', description: 'Path to scope deletion' }
      },
      required: ['name']
    }
  },
  {
    name: 'cookies_clear',
    description: 'Clear all browser cookies',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' }
      }
    }
  },
  {
    name: 'network_headers',
    description: 'Set extra HTTP headers for all requests',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        headers: { type: 'object', description: 'Headers object { "Header-Name": "value" }' }
      },
      required: ['headers']
    }
  },
  {
    name: 'network_cache',
    description: 'Enable or disable network cache',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        disabled: { type: 'boolean', description: 'Set to true to disable cache' }
      }
    }
  },
  {
    name: 'network_block',
    description: 'Block URLs matching patterns',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        urls: { type: 'array', items: { type: 'string' }, description: 'URL patterns to block' }
      },
      required: ['urls']
    }
  },
  {
    name: 'page_reload',
    description: 'Reload the current page',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        ignoreCache: { type: 'boolean', description: 'Bypass cache on reload' },
        scriptToEvaluateOnLoad: { type: 'string', description: 'Script to inject on load' }
      }
    }
  },
  {
    name: 'page_wait_for_load',
    description: 'Wait for page load or DOMContentLoaded event',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded'], description: 'Event to wait for' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds' }
      }
    }
  },
  {
    name: 'page_wait_for_network_idle',
    description: 'Wait until network activity stops',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        idleMs: { type: 'number', description: 'How long network must be idle (default 500ms)' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds' },
        maxInflight: { type: 'number', description: 'Max concurrent requests to consider idle (default 0)' }
      }
    }
  },
  {
    name: 'network_wait_for_response',
    description: 'Wait for a specific network response',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        url: { type: 'string', description: 'URL substring to match' },
        urlRegex: { type: 'string', description: 'URL regex pattern to match' },
        method: { type: 'string', description: 'HTTP method to match' },
        status: { type: 'number', description: 'Status code to match' },
        resourceType: { type: 'string', description: 'Resource type to match' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds' }
      }
    }
  },
  // ============================================
  // Phase 2: DOM Tools
  // ============================================
  {
    name: 'element_query',
    description: 'Find element using CSS selector (native CDP, faster than JS)',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        selector: { type: 'string', description: 'CSS selector' },
        nodeId: { type: 'number', description: 'Parent node ID (optional, uses document root)' }
      },
      required: ['selector']
    }
  },
  {
    name: 'element_query_all',
    description: 'Find all elements matching CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        selector: { type: 'string', description: 'CSS selector' },
        nodeId: { type: 'number', description: 'Parent node ID (optional)' }
      },
      required: ['selector']
    }
  },
  {
    name: 'element_scroll_into_view',
    description: 'Scroll element into viewport',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        nodeId: { type: 'number', description: 'Element node ID' }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'element_box_model',
    description: 'Get element position and dimensions',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        nodeId: { type: 'number', description: 'Element node ID' }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'element_focus',
    description: 'Focus a specific element',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        nodeId: { type: 'number', description: 'Element node ID' }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'element_html',
    description: 'Get outer HTML of an element',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        nodeId: { type: 'number', description: 'Element node ID' }
      },
      required: ['nodeId']
    }
  },
  // ============================================
  // Phase 3: Dialog/File Tools
  // ============================================
  {
    name: 'dialog_handle',
    description: 'Accept or dismiss a JavaScript dialog (alert/confirm/prompt)',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        accept: { type: 'boolean', description: 'Accept (true) or dismiss (false)' },
        promptText: { type: 'string', description: 'Text to enter for prompt dialogs' }
      }
    }
  },
  {
    name: 'dialog_wait',
    description: 'Wait for a JavaScript dialog to appear',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds' },
        autoHandle: { type: 'boolean', description: 'Automatically handle the dialog' },
        action: { type: 'string', enum: ['accept', 'dismiss'], description: 'Action if autoHandle is true' },
        promptText: { type: 'string', description: 'Text for prompt if autoHandle is true' }
      }
    }
  },
  {
    name: 'file_upload',
    description: 'Set files on a file input element',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        files: { type: 'array', items: { type: 'string' }, description: 'File paths (WSL paths auto-converted to Windows)' },
        nodeId: { type: 'number', description: 'File input element node ID' },
        backendNodeId: { type: 'number', description: 'Backend node ID (from file_chooser_wait)' }
      },
      required: ['files']
    }
  },
  {
    name: 'file_chooser_wait',
    description: 'Wait for file chooser dialog to open',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds' }
      }
    }
  },
  // ============================================
  // Phase 4: Emulation Tools
  // ============================================
  {
    name: 'emulate_device',
    description: 'Set device viewport, scale, and mobile mode',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        width: { type: 'number', description: 'Viewport width' },
        height: { type: 'number', description: 'Viewport height' },
        deviceScaleFactor: { type: 'number', description: 'Device scale factor (DPR)' },
        mobile: { type: 'boolean', description: 'Enable mobile mode' },
        touch: { type: 'boolean', description: 'Enable touch emulation' },
        maxTouchPoints: { type: 'number', description: 'Max touch points' },
        screenOrientation: { type: 'object', description: '{ type: "portraitPrimary"|"landscapePrimary", angle: number }' },
        clear: { type: 'boolean', description: 'Clear device overrides' }
      }
    }
  },
  {
    name: 'emulate_geolocation',
    description: 'Override geolocation',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        latitude: { type: 'number', description: 'Latitude' },
        longitude: { type: 'number', description: 'Longitude' },
        accuracy: { type: 'number', description: 'Accuracy in meters' },
        clear: { type: 'boolean', description: 'Clear geolocation override' }
      }
    }
  },
  {
    name: 'emulate_timezone',
    description: 'Override timezone',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        timezoneId: { type: 'string', description: 'IANA timezone ID (e.g., "America/New_York")' }
      },
      required: ['timezoneId']
    }
  },
  {
    name: 'emulate_user_agent',
    description: 'Override user agent string',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        userAgent: { type: 'string', description: 'User agent string' },
        platform: { type: 'string', description: 'Platform override' },
        acceptLanguage: { type: 'string', description: 'Accept-Language header value' }
      },
      required: ['userAgent']
    }
  },
  // ============================================
  // Phase 5: Console/Performance Tools
  // ============================================
  {
    name: 'console_enable',
    description: 'Enable console message capture',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        enableLog: { type: 'boolean', description: 'Also enable browser log capture' }
      }
    }
  },
  {
    name: 'console_messages',
    description: 'Get captured console messages',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' },
        since: { type: 'number', description: 'Timestamp to filter messages after' },
        includeLogs: { type: 'boolean', description: 'Include browser log entries' }
      }
    }
  },
  {
    name: 'console_clear',
    description: 'Clear console messages',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' }
      }
    }
  },
  {
    name: 'performance_metrics',
    description: 'Get page performance metrics',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' }
      }
    }
  },
  {
    name: 'page_layout_metrics',
    description: 'Get viewport and content dimensions',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID' }
      }
    }
  }
];

// MCP Protocol handler
class MCPServer {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.requestId = 0;
  }

  async start() {
    log(`Connecting to Windows host at ${WS_URL}...`);

    try {
      await this.connectWebSocket();
    } catch (e) {
      log(`Warning: Could not connect to Windows host: ${e.message}`);
      log('Will respond to MCP requests but browser tools will fail');
    }

    this.setupStdio();
    log('MCP Server ready');
  }

  connectWebSocket() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        log('Connected to Windows host');
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleWebSocketMessage(data);
      });

      this.ws.on('close', () => {
        this.connected = false;
        log('Disconnected from Windows host');

        // Clean up all pending requests - they'll never get responses
        for (const [reqId, pending] of this.pendingRequests) {
          if (pending.timeoutId) clearTimeout(pending.timeoutId);
          this.sendError(reqId, -32000, 'Connection to Windows host lost');
        }
        this.pendingRequests.clear();
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        if (!this.connected) {
          reject(error);
        }
      });
    });
  }

  setupStdio() {
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    process.stdin.on('end', () => {
      log('stdin closed, shutting down');
      process.exit(0);
    });
  }

  processBuffer() {
    // MCP uses newline-delimited JSON
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIndex);
      this.buffer = this.buffer.substring(newlineIndex + 1);

      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMCPMessage(message);
        } catch (e) {
          log(`Failed to parse MCP message: ${e.message}`);
        }
      }
    }
  }

  handleMCPMessage(message) {
    const method = message.method;
    log(`MCP request: ${method} (id: ${message.id})`);

    // Handle MCP protocol messages locally
    switch (method) {
      case 'initialize':
        this.handleInitialize(message);
        break;
      case 'initialized':
        // Notification, no response needed
        log('Client initialized');
        break;
      case 'tools/list':
        this.handleToolsList(message);
        break;
      case 'tools/call':
        this.handleToolCall(message);
        break;
      case 'ping':
        this.sendResponse(message.id, {});
        break;
      default:
        log(`Unknown method: ${method}`);
        this.sendError(message.id, -32601, `Method not found: ${method}`);
    }
  }

  handleInitialize(message) {
    log('Handling initialize request');
    this.sendResponse(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'claude-in-chrome-bridge',
        version: '1.0.0'
      }
    });
  }

  handleToolsList(message) {
    log('Handling tools/list request');
    this.sendResponse(message.id, {
      tools: BROWSER_TOOLS
    });
  }

  async handleToolCall(message) {
    const toolName = message.params?.name;
    const args = message.params?.arguments || {};

    log(`Tool call: ${toolName}`);

    // Try to reconnect if not connected
    if (!this.connected || !this.ws || this.ws.readyState !== 1) {
      log('Not connected, attempting to reconnect...');
      try {
        await this.connectWebSocket();
      } catch (e) {
        log(`Reconnection failed: ${e.message}`);
        this.sendError(message.id, -32000, 'Not connected to Chrome extension. Make sure the Windows host is running (click Claude in Chrome extension).');
        return;
      }
    }

    // Store pending request for response matching with timeout
    const REQUEST_TIMEOUT_MS = 60000; // 60 second timeout
    const startTime = Date.now();

    const timeoutId = setTimeout(() => {
      if (this.pendingRequests.has(message.id)) {
        this.pendingRequests.delete(message.id);
        log(`Request ${message.id} timed out after ${REQUEST_TIMEOUT_MS}ms`);
        this.sendError(message.id, -32000, `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
    }, REQUEST_TIMEOUT_MS);

    this.pendingRequests.set(message.id, {
      originalId: message.id,
      timeoutId,
      startTime,
      toolName
    });

    // Forward to Windows host / Chrome extension
    // Use MCP-style JSON-RPC format that Chrome extension expects
    const bridgeMessage = {
      id: String(message.id),
      direction: 'to-chrome',
      timestamp: Date.now(),
      payload: {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        },
        id: message.id
      }
    };

    log(`Sending to Windows: ${JSON.stringify(bridgeMessage.payload)}`);
    this.ws.send(JSON.stringify(bridgeMessage));
  }

  handleWebSocketMessage(data) {
    try {
      const bridgeMessage = JSON.parse(data.toString());
      log(`Received from Windows: ${JSON.stringify(bridgeMessage).substring(0, 200)}`);

      if (bridgeMessage.direction === 'from-chrome' && bridgeMessage.payload) {
        const payload = bridgeMessage.payload;

        // Check if this is a response to a pending request
        // Handle both string and number requestId (type coercion)
        const reqId = payload.requestId;
        const numReqId = typeof reqId === 'string' ? parseInt(reqId, 10) : reqId;

        if (reqId && (this.pendingRequests.has(reqId) || this.pendingRequests.has(numReqId))) {
          const actualKey = this.pendingRequests.has(reqId) ? reqId : numReqId;
          const pendingReq = this.pendingRequests.get(actualKey);

          // Clear timeout to prevent memory leak
          if (pendingReq?.timeoutId) {
            clearTimeout(pendingReq.timeoutId);
          }

          // Log performance timing
          if (pendingReq?.startTime) {
            const latency = Date.now() - pendingReq.startTime;
            log(`[PERF] ${pendingReq.toolName || 'unknown'} completed in ${latency}ms`);
          }

          this.pendingRequests.delete(actualKey);

          if (payload.error) {
            this.sendError(payload.requestId, -32000, payload.error);
          } else {
            const result = payload.result || payload;

            // Handle image responses (screenshots) - save to file and return path
            if (result.type === 'image' && result.data) {
              const ext = (result.mediaType || 'image/jpeg').split('/')[1] || 'jpg';
              const filename = `screenshot-${Date.now()}.${ext}`;
              const filepath = path.join(SCREENSHOT_DIR, filename);

              // Decode base64 and save to file
              const imageBuffer = Buffer.from(result.data, 'base64');
              fs.writeFileSync(filepath, imageBuffer);

              this.sendResponse(payload.requestId, {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      type: 'screenshot',
                      path: filepath,
                      size: imageBuffer.length,
                      format: ext
                    })
                  }
                ]
              });
            } else {
              // Regular text/JSON responses
              this.sendResponse(payload.requestId, {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result)
                  }
                ]
              });
            }
          }
        }
      }
    } catch (e) {
      log(`Failed to parse WebSocket message: ${e.message}`);
    }
  }

  sendResponse(id, result) {
    const response = {
      jsonrpc: '2.0',
      id: id,
      result: result
    };
    const json = JSON.stringify(response);
    process.stdout.write(json + '\n');
  }

  sendError(id, code, message) {
    const response = {
      jsonrpc: '2.0',
      id: id,
      error: {
        code: code,
        message: message
      }
    };
    const json = JSON.stringify(response);
    process.stdout.write(json + '\n');
  }
}

// Start the server
const server = new MCPServer();
server.start().catch((error) => {
  log(`Failed to start: ${error.message}`);
  process.exit(1);
});
