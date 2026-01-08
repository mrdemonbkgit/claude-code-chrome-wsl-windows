# CDP Upgrade Test Plan

## Test Scope

Testing 30 new MCP tools implemented across 5 phases, plus core event infrastructure.

> **Note**: The implementation auto-enables required CDP domains (`Page.enable`, `Network.enable`, `DOM.enable`, `Runtime.enable`) and lifecycle events (`Page.setLifecycleEventsEnabled`) on target connection. Geolocation permissions are auto-granted via `Browser.grantPermissions`. File chooser intercept is auto-enabled in `waitForFileChooser`.

### Tools to Test

| Phase | Tool | CDP Method(s) |
|-------|------|---------------|
| 1 | `cookies_get` | `Network.getCookies` |
| 1 | `cookies_set` | `Network.setCookies` |
| 1 | `cookies_delete` | `Network.deleteCookies` |
| 1 | `cookies_clear` | `Network.clearBrowserCookies` |
| 1 | `network_headers` | `Network.setExtraHTTPHeaders` |
| 1 | `network_cache` | `Network.setCacheDisabled` |
| 1 | `network_block` | `Network.setBlockedURLs` |
| 1 | `page_reload` | `Page.reload` |
| 1 | `page_wait_for_load` | `Page.lifecycleEvent` |
| 1 | `page_wait_for_network_idle` | Network events |
| 1 | `network_wait_for_response` | `Network.responseReceived` |
| 2 | `element_query` | `DOM.querySelector` |
| 2 | `element_query_all` | `DOM.querySelectorAll` |
| 2 | `element_scroll_into_view` | `DOM.scrollIntoViewIfNeeded` |
| 2 | `element_box_model` | `DOM.getBoxModel` |
| 2 | `element_focus` | `DOM.focus` |
| 2 | `element_html` | `DOM.getOuterHTML` |
| 3 | `dialog_handle` | `Page.handleJavaScriptDialog` |
| 3 | `dialog_wait` | `Page.javascriptDialogOpening` |
| 3 | `file_upload` | `DOM.setFileInputFiles` |
| 3 | `file_chooser_wait` | `Page.fileChooserOpened` |
| 4 | `emulate_device` | `Emulation.setDeviceMetricsOverride` |
| 4 | `emulate_geolocation` | `Emulation.setGeolocationOverride` |
| 4 | `emulate_timezone` | `Emulation.setTimezoneOverride` |
| 4 | `emulate_user_agent` | `Emulation.setUserAgentOverride` |
| 5 | `console_enable` | `Console.enable`, `Log.enable` |
| 5 | `console_messages` | Event queue retrieval |
| 5 | `console_clear` | `Console.clearMessages` |
| 5 | `performance_metrics` | `Performance.getMetrics` |
| 5 | `page_layout_metrics` | `Page.getLayoutMetrics` |

---

## Test Strategy

### 1. Test Environment Setup

**Prerequisites:**
- Chrome running with `--remote-debugging-port=9222`
- Windows host running (`windows-host/src/index.js`)
- WSL bridge can connect

**Test Pages Needed:**
- Create `test-pages/` directory with HTML files for each test scenario
- Host locally or use public test sites (httpbin.org, example.com)

### 2. Test Categories

| Category | Purpose | Approach |
|----------|---------|----------|
| **Smoke Tests** | Quick verification each tool works | 1 call per tool, minimal params |
| **Functional Tests** | Full parameter coverage | All params, expected returns |
| **Edge Case Tests** | Boundary conditions | Invalid inputs, timeouts |
| **Integration Tests** | Tool combinations | Real workflows |
| **Error Handling** | Failure modes | CDP errors, connection loss |

---

## Test Execution Plan

### Phase 1: Cookies & Network Tests

#### Test 1.1: cookies_get
```
Scenario A: Get all cookies for current page
- Navigate to example.com
- Call cookies_get without URLs
- Verify: returns { cookies: [...] }

Scenario B: Get cookies for specific URLs
- Call cookies_get with urls: ["https://example.com"]
- Verify: filtering works

Edge Cases:
- Page with no cookies → empty array
- Cookies with special characters → proper encoding
```

#### Test 1.2: cookies_set
```
Scenario A: Set single cookie
- Call cookies_set with { name: "test", value: "123", domain: "example.com" }
- Verify with cookies_get

Scenario B: Set multiple cookies
- Call with array of cookies
- Verify count in response

Scenario C: Set cookie with all properties
- Include secure, httpOnly, sameSite, expires
- Verify properties persisted

Edge Cases:
- Invalid domain → CDP error
- Expired timestamp → cookie not set or immediately expired

Scenario D: Cookie attribute edge cases
- Host-only cookie (no domain prefix) vs domain cookie (with leading dot)
- SameSite=None requires Secure=true
- url vs domain/path distinction in get/delete
```

#### Test 1.3: cookies_delete
```
Scenario A: Delete by name only
- Set a cookie, then delete by name
- Verify deleted

Scenario B: Delete with domain/path scope
- Set cookies on different paths
- Delete specific one
- Verify only targeted one removed

Edge Cases:
- Delete non-existent cookie → no error
```

#### Test 1.4: cookies_clear
```
Scenario: Clear all cookies
- Set multiple cookies across domains
- Call cookies_clear
- Verify cookies_get returns empty array
```

#### Test 1.5: network_headers
```
Scenario A: Set single header
- Call network_headers with { "X-Custom": "value" }
- Navigate to http://localhost:8080/api/headers (local test server)
- Get page text, verify X-Custom header in response

Scenario B: Set authorization header
- Set { "Authorization": "Bearer token123" }
- Navigate to /api/headers
- Verify Authorization header in response JSON

Edge Cases:
- Empty headers object → should clear custom headers
```

#### Test 1.6: network_cache
```
Scenario A: Disable cache
- Call network_cache with disabled: true
- Reload page
- Verify no 304 responses (all 200s)

Scenario B: Enable cache
- Call with disabled: false
- Verify caching restored
```

#### Test 1.7: network_block
```
Scenario A: Block specific URL pattern
- Block "*slow-image*"
- Navigate to slow-load.html
- Verify /api/slow-image request blocked (load event fires immediately)

Scenario B: Block multiple patterns
- Block ["*slow*", "*blocked*"]
- Navigate to page requesting both
- Verify both blocked

Edge Cases:
- Clear blocking with urls: [] → unblocks all
```

#### Test 1.8: page_reload
```
Scenario A: Normal reload
- Call page_reload
- Verify page content refreshed

Scenario B: Bypass cache
- Call with ignoreCache: true
- Verify fresh content loaded

Scenario C: Inject script on load
- Call with scriptToEvaluateOnLoad: "window.injected = true"
- Check window.injected after load
```

#### Test 1.9: page_wait_for_load
```
Scenario A: Wait for load event
- Navigate to page
- Immediately call page_wait_for_load with waitUntil: "load"
- Verify returns after page fully loaded

Scenario B: Wait for DOMContentLoaded
- Call with waitUntil: "domcontentloaded"
- Verify returns before images load

Edge Cases:
- Timeout: 100ms on slow page → should error
- Already loaded page → should return immediately (or next load)

Scenario C: Main-frame vs iframe
- Load page with iframe that loads separately
- Call page_wait_for_load
- Verify waits for MAIN frame load, not iframe
```

#### Test 1.10: page_wait_for_network_idle
```
Scenario A: Wait for idle after page load
- Navigate to page with XHR requests
- Call page_wait_for_network_idle
- Verify returns after all requests complete

Scenario B: Custom idle duration
- Call with idleMs: 2000
- Verify waits 2 seconds of no activity

Scenario C: Allow some inflight
- Call with maxInflight: 2
- Verify returns with ≤2 pending requests

Edge Cases:
- WebSocket connection → should be ignored (doesn't block idle)
- Timeout → returns error

Scenario D: Concurrent waits
- Start two page_wait_for_network_idle calls simultaneously
- Verify both resolve independently without interference
```

#### Test 1.11: network_wait_for_response
```
Scenario A: Wait by URL substring
- Call network_wait_for_response with url: "/api"
- Trigger fetch to /api/data
- Verify returns matching response

Scenario B: Wait by regex
- Call with urlRegex: "api/v[0-9]+"  (raw pattern, no delimiters)
- Verify regex matching works
- NOTE: urlRegex is a raw pattern string, NOT /pattern/ syntax

Scenario C: Wait by HTTP method
- Call with method: "POST"
- Trigger POST request
- Verify filters correctly (not GET requests)

Scenario D: Wait by status code
- Call with status: 200
- Verify only 200 responses match

Edge Cases:
- Invalid regex → should throw early with clear message
- Timeout → returns timeout error
```

---

### Phase 2: DOM Tests

**Test Page HTML:**
```html
<!-- Create file: test-pages/dom-test.html -->
<html>
<body>
  <div id="container">
    <button id="btn1">Click me</button>
    <input id="input1" type="text" />
    <div class="item">Item 1</div>
    <div class="item">Item 2</div>
    <div class="item" style="margin-top: 2000px">Item 3 (far down)</div>
  </div>
</body>
</html>
```

#### Test 2.1: element_query
```
Scenario A: Find by ID
- Call element_query with selector: "#btn1"
- Verify: nodeId > 0, found: true

Scenario B: Find by class
- Call with selector: ".item"
- Verify returns first match only

Scenario C: Complex selector
- Call with selector: "#container > button"
- Verify correct element

Edge Cases:
- Non-existent selector → found: false, nodeId: 0
- Invalid selector syntax → CDP error
- After navigation → docVersion increments
```

#### Test 2.2: element_query_all
```
Scenario A: Find multiple elements
- Call with selector: ".item"
- Verify: nodeIds array has 3 elements, count: 3

Scenario B: No matches
- Call with selector: ".nonexistent"
- Verify: nodeIds: [], count: 0
```

#### Test 2.3: element_scroll_into_view
```
Scenario: Scroll to offscreen element
- Query the far-down .item element
- Call element_scroll_into_view with its nodeId
- Take screenshot or get box model to verify visible

Edge Cases:
- Already visible element → no-op, still succeeds
- Detached/invalid nodeId → CDP error
```

#### Test 2.4: element_box_model
```
Scenario: Get element dimensions
- Query button element
- Call element_box_model with nodeId
- Verify: model contains content, padding, border, margin arrays
- Each quad has 8 numbers (4 x,y pairs)

Edge Cases:
- Hidden element (display: none) → may fail
- Zero-dimension element → returns zeros
```

#### Test 2.5: element_focus
```
Scenario: Focus input element
- Query #input1
- Call element_focus with nodeId
- Execute JS: document.activeElement.id
- Verify returns "input1"

Edge Cases:
- Non-focusable element (div) → may succeed or fail
```

#### Test 2.6: element_html
```
Scenario: Get outer HTML
- Query #container
- Call element_html with nodeId
- Verify: outerHTML contains expected content

Edge Cases:
- Very large element → may be truncated?
```

---

### Phase 3: Dialog & File Tests

**Test Page HTML:**
```html
<!-- Create file: test-pages/dialog-test.html -->
<html>
<body>
  <button onclick="alert('Hello!')">Show Alert</button>
  <button onclick="confirm('Are you sure?')">Show Confirm</button>
  <button onclick="prompt('Enter name:', 'default')">Show Prompt</button>
  <input type="file" id="fileInput" />
  <input type="file" id="multiFile" multiple />
</body>
</html>
```

#### Test 3.1: dialog_handle
```
Scenario A: Accept alert
- Click alert button
- Call dialog_handle with accept: true
- Verify dialog dismissed

Scenario B: Dismiss confirm
- Click confirm button
- Call dialog_handle with accept: false
- Check return value in page (should be false)

Scenario C: Enter prompt text
- Click prompt button
- Call dialog_handle with accept: true, promptText: "Claude"
- Verify entered value in page

Edge Cases:
- Call when no dialog open → CDP error
```

#### Test 3.2: dialog_wait
```
Scenario A: Wait for dialog
- Call dialog_wait (will block until dialog appears)
- In parallel, click alert button
- Verify returns { type: "alert", message: "Hello!", ... }

Scenario B: Auto-handle dialog
- Call dialog_wait with autoHandle: true, action: "accept"
- Click confirm button
- Verify dialog auto-dismissed

Edge Cases:
- Timeout before dialog → timeout error
- Multiple rapid dialogs → should handle each

Scenario C: Race condition - event before wait
- Trigger dialog BEFORE calling dialog_wait
- Verify wait still captures dialog (if buffered) or times out appropriately
```

#### Test 3.3: file_upload
```
Scenario A: Upload single file
- Create test file at /mnt/c/temp/test.txt
- Query #fileInput nodeId
- Call file_upload with files: ["/mnt/c/temp/test.txt"], nodeId
- Verify path converted to C:\temp\test.txt in response

Scenario B: Upload multiple files
- Use #multiFile input
- Set multiple files
- Verify all files set

Edge Cases:
- Non-existent file → CDP may error
- Non-/mnt path → returns unconverted (may fail)
```

#### Test 3.4: file_chooser_wait
```
Scenario: Capture file chooser event
- Call file_chooser_wait (will block)
- Click on file input (triggers chooser)
- Verify returns { backendNodeId, mode, frameId }

Edge Cases:
- Timeout → returns timeout error
- Need to click to trigger (user gesture required)
```

---

### Phase 4: Emulation Tests

#### Test 4.1: emulate_device
```
Scenario A: Mobile viewport
- Call emulate_device with width: 375, height: 667, mobile: true
- Take screenshot
- Verify dimensions match

Scenario B: Tablet with touch
- Call with width: 768, height: 1024, touch: true
- Verify touch events work (test with touch-dependent page)

Scenario C: Device scale factor
- Call with deviceScaleFactor: 2
- Verify window.devicePixelRatio === 2

Scenario D: Clear override
- Call with clear: true
- Verify returns to default dimensions

Edge Cases:
- Invalid dimensions → may error or use fallbacks
```

#### Test 4.2: emulate_geolocation
```
Scenario A: Set location (San Francisco)
- Call emulate_geolocation with latitude: 37.7749, longitude: -122.4194
- Execute: new Promise(r => navigator.geolocation.getCurrentPosition(r))
- Verify coords match

Scenario B: Set accuracy
- Include accuracy: 10
- Verify in position result

Scenario C: Clear override
- Call with clear: true
- Should use real location (or error if unavailable)

Edge Cases:
- Invalid coordinates → CDP may error
- Permission auto-granted via Browser.grantPermissions
```

#### Test 4.3: emulate_timezone
```
Scenario: Set New York timezone
- Call emulate_timezone with timezoneId: "America/New_York"
- Execute: new Date().getTimezoneOffset()
- Verify offset is 300 (EST) or 240 (EDT)
  NOTE: getTimezoneOffset() returns POSITIVE for US zones (minutes behind UTC)

Scenario B: Set UTC
- Call with timezoneId: "UTC"
- Verify offset is 0

Scenario C: Set Tokyo
- Call with timezoneId: "Asia/Tokyo"
- Verify offset is -540 (9 hours ahead of UTC)

Scenario D: Verify timezone name (not just offset)
- Call with timezoneId: "America/New_York"
- Execute: Intl.DateTimeFormat().resolvedOptions().timeZone
- Verify returns "America/New_York" (offsets can be ambiguous)

Edge Cases:
- Invalid timezone ID → CDP error "Unsupported timezone"
```

#### Test 4.4: emulate_user_agent
```
Scenario A: Change user agent
- Call emulate_user_agent with userAgent: "CustomBot/1.0"
- Execute: navigator.userAgent
- Verify changed

Scenario B: With platform
- Include platform: "Win32"
- Verify navigator.platform changed

Scenario C: With language
- Include acceptLanguage: "fr-FR"
- Navigate to httpbin.org/headers
- Verify Accept-Language header
```

---

### Phase 5: Console & Performance Tests

**Test Page HTML:**
```html
<!-- Create file: test-pages/console-test.html -->
<html>
<body>
  <script>
    console.log("Log message");
    console.warn("Warning message");
    console.error("Error message");
    console.info("Info message");
  </script>
</body>
</html>
```

#### Test 5.1: console_enable
```
Scenario A: Enable console capture
- Call console_enable
- Navigate to console-test.html
- Verify messages captured (check with console_messages)

Scenario B: Enable with browser logs
- Call with enableLog: true
- Verify Log.enable also called
```

#### Test 5.2: console_messages
```
Scenario A: Get all messages
- After console_enable and page load
- Call console_messages
- Verify messages array contains log/warn/error/info

Scenario B: Filter by timestamp
- Note current timestamp (Date.now() in milliseconds)
- Execute more console.log in page
- Call with since: timestamp
- Verify only new messages returned
- NOTE: `since` is JavaScript Date.now() timestamp (milliseconds since epoch)

Scenario C: Include browser logs
- Call with includeLogs: true
- Verify logEntries array present
```

#### Test 5.3: console_clear
```
Scenario: Clear captured messages
- Generate console messages
- Call console_clear
- Call console_messages
- Verify empty arrays returned
```

#### Test 5.4: performance_metrics
```
Scenario: Get metrics
- Navigate to a page
- Call performance_metrics
- Verify metrics array includes:
  - JSHeapUsedSize
  - JSHeapTotalSize
  - Documents
  - Nodes
  - LayoutCount
```

#### Test 5.5: page_layout_metrics
```
Scenario: Get layout dimensions
- Navigate to a page
- Call page_layout_metrics
- Verify returns:
  - layoutViewport: { pageX, pageY, clientWidth, clientHeight }
  - visualViewport: { offsetX, offsetY, pageX, pageY, clientWidth, clientHeight, scale }
  - contentSize: { x, y, width, height }
```

---

## Integration Tests

### Integration 1: Cookie-Based Auth Flow
```
1. cookies_clear (clean slate)
2. cookies_set { name: "auth_token", value: "xyz123", domain: ".example.com" }
3. navigate to authenticated page
4. page_wait_for_load
5. cookies_get → verify auth_token present
6. get_page_text → verify authenticated content
```

### Integration 2: DOM Form Interaction
```
1. navigate to form page
2. element_query selector: "input[name=email]"
3. element_scroll_into_view nodeId
4. element_focus nodeId
5. computer type: "test@example.com"
6. element_query selector: "button[type=submit]"
7. element_box_model → get center coordinates
   NOTE: box_model returns page coordinates (content quad)
   For clicks after scroll, use visualViewport from page_layout_metrics
   Click coords = (quad[0] + quad[2])/2, (quad[1] + quad[5])/2
8. computer click at center
9. network_wait_for_response url: "/submit"
```

### Integration 3: Mobile Emulation Workflow
```
1. emulate_device width: 375, height: 667, mobile: true
2. emulate_user_agent userAgent: "Mozilla/5.0 (iPhone...)"
3. emulate_geolocation latitude: 40.7128, longitude: -74.0060
4. navigate to location-aware mobile site
5. page_wait_for_load
6. computer screenshot → verify mobile layout
7. emulate_device clear: true
```

### Integration 4: Console Debugging
```
1. console_enable enableLog: true
2. navigate to page with errors
3. page_wait_for_load
4. console_messages includeLogs: true
5. Check for errors in returned messages
6. performance_metrics → check heap usage
```

### Integration 5: File Upload Flow
```
1. navigate to upload form
2. element_query selector: "input[type=file]"
3. file_upload files: ["/mnt/c/temp/doc.pdf"], nodeId
4. element_query selector: "button.submit"
5. computer click
6. network_wait_for_response method: "POST", status: 200
```

---

## Error Handling Tests

### CDP Error Cases
```
1. Invalid tabId → "No suitable target found"
2. Stale nodeId after navigation → CDP DOM error
3. Invalid CSS selector → "Syntax error in query selector"
4. dialog_handle when no dialog → "No dialog is showing"
5. Invalid timezone ID → "Unsupported timezone"
6. Invalid urlRegex → "Invalid urlRegex pattern: ..."
```

### Connection Error Cases
```
1. Chrome not running → "Failed to connect to Chrome"
2. Windows host not running → "Not connected to Chrome extension"
3. Tab closed during operation → WebSocket close
```

### Timeout Cases
```
1. page_wait_for_load with timeoutMs: 100 on slow page
2. page_wait_for_network_idle with timeoutMs: 100
3. network_wait_for_response with timeoutMs: 100
4. dialog_wait with timeoutMs: 100
5. file_chooser_wait with timeoutMs: 100
```

---

## Event Infrastructure Tests

### Bounded Collections
```
1. Generate >1000 events → verify eventQueue stays at 1000
2. Generate >500 network requests → verify networkRequests map bounded
3. Verify oldest entries evicted when limit reached
```

### Cleanup on Disconnect
```
1. Connect to target
2. Generate events and network requests
3. Close WebSocket connection
4. Verify eventListeners cleared
5. Verify eventQueue cleared
6. Verify networkRequests cleared
```

### Document Version Tracking
```
1. Connect to target, note docVersion
2. Navigate to new page
3. Verify docVersion incremented
4. Verify rootNodeId reset to null
5. DOM queries work with fresh document
```

---

## Test Implementation

### Option A: Direct WebSocket Test Script (Recommended First)
Create `tests/smoke-test.js`:
```javascript
const WebSocket = require('ws');

class TestClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.pending = new Map(); // id -> { resolve, reject }
    this.nextId = 1;

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data);
      // Only handle responses, not events
      if (msg.direction === 'from-chrome' && msg.payload?.requestId) {
        const id = String(msg.payload.requestId);
        const pending = this.pending.get(id);
        if (pending) {
          this.pending.delete(id);
          if (msg.payload.error) {
            pending.reject(new Error(msg.payload.error));
          } else {
            pending.resolve(msg.payload.result);
          }
        }
      }
    });
  }

  async sendTool(name, args) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(String(id), { resolve, reject });
      this.ws.send(JSON.stringify({
        id: String(id),
        direction: 'to-chrome',
        timestamp: Date.now(),
        payload: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name, arguments: args },
          id
        }
      }));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(String(id))) {
          this.pending.delete(String(id));
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }
}

// Usage:
// const client = new TestClient('ws://WINDOWS_HOST_IP:19222');
// await client.sendTool('cookies_get', { tabId: 123 });
```

### Option B: MCP Tool Testing
Use Claude Code's browser tools directly in conversation.

### Option C: Automated Test Suite
Create comprehensive test framework with assertions.

---

## Verification Checklist

For each tool verify:
- [ ] Basic functionality works
- [ ] All parameters handled correctly
- [ ] Return value matches expected schema
- [ ] Error cases return descriptive messages
- [ ] Logs show appropriate debug info
- [ ] No memory leaks (bounded collections work)

---

## Test Files to Create

| File | Purpose |
|------|---------|
| `test-pages/dom-test.html` | DOM tool tests |
| `test-pages/dialog-test.html` | Dialog tests |
| `test-pages/console-test.html` | Console capture tests |
| `test-pages/slow-load.html` | Wait timeout tests |
| `test-pages/xhr-test.html` | Network response tests |
| `tests/smoke-test.js` | Quick verification |

### Test Page: slow-load.html
```html
<!DOCTYPE html>
<html>
<body>
  <div id="status">Loading...</div>
  <img id="slow-img" />
  <script>
    // DOMContentLoaded fires early, load waits for slow image
    document.getElementById('status').textContent = 'DOM Ready';
    // Load slow endpoint (requires test server with /api/slow-image)
    document.getElementById('slow-img').src = '/api/slow-image';
    window.addEventListener('load', () => {
      document.getElementById('status').textContent = 'Fully Loaded';
    });
  </script>
</body>
</html>
```

**Add to test server for slow-load.html:**
```javascript
// In server.js, add:
if (req.url === '/api/slow-image') {
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  }, 1500); // 1.5 second delay
}
```

### Test Page: xhr-test.html
```html
<!DOCTYPE html>
<html>
<body>
  <div id="result"></div>
  <script>
    async function makeRequest(url, method = 'GET') {
      const response = await fetch(url, { method });
      const data = await response.text();
      document.getElementById('result').textContent = data;
      return data;
    }
  </script>
</body>
</html>
```

### Hosting Test Pages
Test pages should be served from Windows filesystem so Chrome can access them.

**Option 1: Simple static server (limited)**
```bash
# Only works for GET requests, no POST/delays
python -m http.server 8080 --directory C:\test-pages
```

**Option 2: Full test server (recommended)**
Create `C:\test-pages\server.js`:
```javascript
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  // Serve static files
  if (req.method === 'GET' && !req.url.startsWith('/api')) {
    const file = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    if (fs.existsSync(file)) {
      res.writeHead(200);
      fs.createReadStream(file).pipe(res);
      return;
    }
  }

  // API endpoints for testing
  if (req.url === '/api/headers') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ headers: req.headers }));
  } else if (req.url === '/api/slow') {
    setTimeout(() => {
      res.writeHead(200);
      res.end('slow response');
    }, 2000);
  } else if (req.url === '/api/submit' && req.method === 'POST') {
    res.writeHead(200);
    res.end('submitted');
  } else if (req.url === '/api/status/404') {
    res.writeHead(404);
    res.end('not found');
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(8080, () => console.log('Test server on http://localhost:8080'));
```

Run with: `node C:\test-pages\server.js`

---

## Execution Order

1. **Smoke tests** - 1 call per tool (~30 min)
2. **Phase 1 functional** - Cookies/Network (~45 min)
3. **Phase 2 functional** - DOM (~30 min)
4. **Phase 3 functional** - Dialogs/Files (~30 min)
5. **Phase 4 functional** - Emulation (~30 min)
6. **Phase 5 functional** - Console/Perf (~20 min)
7. **Integration tests** (~30 min)
8. **Error handling tests** (~20 min)

---

## Codex Review Findings (Verified)

### First Pass (GPT-5.2-codex, high reasoning)
| Finding | Status | Details |
|---------|--------|---------|
| sendTool race condition | VALID | Fixed in test script - now uses ID routing |
| Timezone offset sign | VALID | Fixed assertion - getTimezoneOffset() returns positive for US |
| Tool count mismatch | VALID | Fixed - 30 tools, not 26 |
| Missing test pages | VALID | Added slow-load.html, xhr-test.html definitions |
| Cookie edge cases | VALID | Added host-only, SameSite=None tests |
| urlRegex format | VALID | Clarified - raw pattern, no delimiters |
| Lifecycle events | FALSE POSITIVE | Implementation enables at cdp-client.js:223 |
| Geolocation perms | FALSE POSITIVE | Implementation grants at cdp-client.js:782 |
| File chooser intercept | FALSE POSITIVE | Implementation enables at cdp-client.js:730 |
| Touch emulation | FALSE POSITIVE | Implementation calls setTouchEmulationEnabled |

### Second Pass (GPT-5.2-codex, high reasoning)
| Finding | Status | Details |
|---------|--------|---------|
| Python http.server no POST | VALID | Added Node.js test server with POST/slow endpoints |
| slow-load.html data URI fast | VALID | Fixed to use slow server endpoint |
| Cookie url/domain scoping | FALSE POSITIVE | CDP accepts either url OR domain+path |
| file_upload C:\fakepath | FALSE POSITIVE | CDP bypasses browser security, sets real paths |
| External dependencies | VALID | Replaced with local test server endpoints |
| Main-frame vs iframe | VALID | Added main-frame filtering test scenario |
| network_cache 304 check | NOTED | Plan still uses 304 check, could enhance |
| console_messages timestamp | FALSE POSITIVE | Implementation uses Date.now() (line 84) |
| emulate_timezone Intl check | VALID | Added Intl.DateTimeFormat verification |
| Box model coordinates | VALID | Added note about page vs viewport coords |

## Integration Prerequisites

The integration tests use these additional (pre-existing) tools not in the 30 new tools:
- `navigate` - Navigate to URL
- `computer` - Screenshots, clicks, typing
- `get_page_text` - Extract page text

These are part of the original MCP server implementation and should be verified working before integration tests.
