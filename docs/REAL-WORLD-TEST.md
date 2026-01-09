# Real-World Integration Test: E-Commerce Mobile QA

## Scenario Overview

**Goal**: Simulate a complete QA automation workflow for testing an e-commerce site across devices, including:
- Mobile device emulation with geolocation
- Cookie-based session management
- Form interactions and validation
- Network monitoring and performance analysis
- Console error detection
- File upload functionality

**Test Site**: Local test page (`C:\test-pages\ecommerce-test.html`) served via Python or Node HTTP server.

---

## Prerequisites

### 1. Create Test Page

Save as `C:\test-pages\ecommerce-test.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>E-Commerce Test Page</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .product { border: 1px solid #ccc; padding: 15px; margin: 10px 0; }
    .product-far { margin-top: 1500px; }
    input, button { padding: 10px; margin: 5px 0; display: block; }
    .error { color: red; }
    #location-info { background: #f0f0f0; padding: 10px; margin: 10px 0; }
    #timezone-info { background: #e0f0e0; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>Test E-Commerce Site</h1>

  <!-- Login Form -->
  <section id="login-section">
    <h2>Login</h2>
    <input type="email" id="email" placeholder="Email" />
    <input type="password" id="password" placeholder="Password" />
    <button id="login-btn" onclick="handleLogin()">Login</button>
    <div id="login-status"></div>
  </section>

  <!-- Location Info -->
  <section id="location-section">
    <h2>Your Location</h2>
    <button onclick="getLocation()">Detect Location</button>
    <div id="location-info">Click to detect</div>
  </section>

  <!-- Timezone Info -->
  <section id="timezone-section">
    <h2>Timezone</h2>
    <div id="timezone-info"></div>
  </section>

  <!-- Product Listings -->
  <section id="products">
    <h2>Products</h2>
    <div class="product" id="product-1">
      <h3>Product 1 - Laptop</h3>
      <p>Price: $999</p>
      <button onclick="addToCart(1)">Add to Cart</button>
    </div>
    <div class="product" id="product-2">
      <h3>Product 2 - Phone</h3>
      <p>Price: $699</p>
      <button onclick="addToCart(2)">Add to Cart</button>
    </div>
    <div class="product product-far" id="product-3">
      <h3>Product 3 - Tablet (scroll to see)</h3>
      <p>Price: $499</p>
      <button onclick="addToCart(3)">Add to Cart</button>
    </div>
  </section>

  <!-- File Upload -->
  <section id="upload-section">
    <h2>Upload Receipt</h2>
    <input type="file" id="receipt-upload" />
    <div id="upload-status"></div>
  </section>

  <!-- Checkout with Confirmation -->
  <section id="checkout-section">
    <h2>Checkout</h2>
    <button id="checkout-btn" onclick="handleCheckout()">Complete Purchase</button>
  </section>

  <script>
    // Display timezone on load
    document.getElementById('timezone-info').textContent =
      `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}, ` +
      `Offset: ${new Date().getTimezoneOffset()} minutes, ` +
      `Local time: ${new Date().toLocaleString()}`;

    // Log user agent
    console.log('User Agent:', navigator.userAgent);
    console.log('Platform:', navigator.platform);

    function handleLogin() {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      if (!email || !password) {
        console.error('Login failed: Missing credentials');
        document.getElementById('login-status').innerHTML =
          '<span class="error">Please fill in all fields</span>';
        return;
      }

      console.log('Login attempt for:', email);
      document.getElementById('login-status').textContent = 'Logged in as: ' + email;

      // Simulate API call
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }).catch(() => console.warn('API endpoint not available'));
    }

    function getLocation() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const info = `Lat: ${pos.coords.latitude.toFixed(4)}, ` +
                       `Lng: ${pos.coords.longitude.toFixed(4)}, ` +
                       `Accuracy: ${pos.coords.accuracy}m`;
          document.getElementById('location-info').textContent = info;
          console.log('Geolocation:', info);
        },
        (err) => {
          document.getElementById('location-info').textContent = 'Error: ' + err.message;
          console.error('Geolocation error:', err.message);
        }
      );
    }

    function addToCart(productId) {
      console.log('Added product ' + productId + ' to cart');
      alert('Product ' + productId + ' added to cart!');
    }

    function handleCheckout() {
      if (confirm('Complete purchase for $2197?')) {
        console.log('Purchase completed!');
        alert('Thank you for your purchase!');
      } else {
        console.log('Purchase cancelled');
      }
    }

    // Simulate some async loading
    setTimeout(() => {
      console.info('Page fully initialized');
    }, 500);
  </script>
</body>
</html>
```

### 2. Start Test Server

```powershell
cd C:\test-pages
python -m http.server 8080
# Or: npx serve -p 8080
```

### 3. Chrome Geolocation Permissions

> **NOTE**: Geolocation requires permission. For automated testing:
> - Use a Chrome profile with geolocation pre-granted for localhost
> - Or run Chrome with `--enable-features=PermissionAutoRevoke` disabled
> - The `emulate_geolocation` CDP tool overrides the actual location but
>   the page still needs permission to call `navigator.geolocation`

To pre-grant permission, navigate to the test page manually once and allow location access.

---

## Test Execution

### Stage 1: Environment Setup & Performance Baseline

```
Tools: console_enable, performance_metrics, page_layout_metrics, tabs_context_mcp
```

1. **Get browser context**
   ```
   tabs_context_mcp { createIfEmpty: true }
   → Save tabId for subsequent calls
   ```

2. **Enable console capture**
   ```
   console_enable { tabId, enableLog: true }
   ```

3. **Get initial performance baseline**
   ```
   performance_metrics { tabId }
   → Record JSHeapUsedSize, Nodes count
   ```

4. **Get layout metrics**
   ```
   page_layout_metrics { tabId }
   → Record initial viewport dimensions
   ```

---

### Stage 2: Mobile Device Emulation

```
Tools: emulate_device, emulate_user_agent, emulate_timezone, emulate_geolocation
```

1. **Set mobile viewport (iPhone 14)**
   ```
   emulate_device {
     tabId,
     width: 390,
     height: 844,
     mobile: true,
     deviceScaleFactor: 3,
     touch: true
   }
   ```

2. **Set mobile user agent**
   ```
   emulate_user_agent {
     tabId,
     userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
     platform: "iPhone",
     acceptLanguage: "en-US"
   }
   ```

3. **Set timezone (simulate user in New York)**
   ```
   emulate_timezone { tabId, timezoneId: "America/New_York" }
   ```

4. **Set geolocation (NYC store location)**
   ```
   emulate_geolocation {
     tabId,
     latitude: 40.7128,
     longitude: -74.0060,
     accuracy: 10
   }
   ```

---

### Stage 3: Network Configuration

```
Tools: cookies_clear, cookies_set, network_headers, network_cache, network_block
```

1. **Clear existing cookies (fresh session)**
   ```
   cookies_clear { tabId }
   ```

2. **Set authentication cookie**
   ```
   cookies_set {
     tabId,
     cookies: {
       name: "session_token",
       value: "test_user_abc123",
       domain: "localhost",
       path: "/",
       httpOnly: true
     }
   }
   ```

3. **Set a tracking cookie (to test delete later)**
   ```
   cookies_set {
     tabId,
     cookies: {
       name: "tracking_id",
       value: "track_xyz789",
       domain: "localhost",
       path: "/"
     }
   }
   ```

4. **Delete tracking cookie (privacy compliance)**
   ```
   cookies_delete {
     tabId,
     name: "tracking_id",
     domain: "localhost"
   }
   ```

5. **Verify tracking cookie was deleted**
   ```
   cookies_get { tabId }
   → Assert: tracking_id cookie is NOT present
   → Assert: session_token cookie IS still present
   ```

6. **Set custom headers (API key, tracking)**
   ```
   network_headers {
     tabId,
     headers: {
       "X-API-Key": "test-key-12345",
       "X-Test-Mode": "true",
       "X-Client-Version": "1.0.0"
     }
   }
   ```

7. **Disable cache for fresh content**
   ```
   network_cache { tabId, disabled: true }
   ```

8. **Block analytics/tracking (for cleaner testing)**
   ```
   network_block {
     tabId,
     urls: ["*google-analytics*", "*facebook*", "*hotjar*"]
   }
   ```

---

### Stage 4: Page Navigation & Loading

```
Tools: navigate, page_wait_for_load, page_wait_for_network_idle, page_reload
```

1. **Navigate to test page**
   ```
   navigate { tabId, url: "http://localhost:8080/ecommerce-test.html" }
   ```

2. **Wait for page load**
   ```
   page_wait_for_load { tabId, waitUntil: "load", timeoutMs: 10000 }
   ```

3. **Wait for network idle (async resources)**
   ```
   page_wait_for_network_idle { tabId, idleMs: 500, timeoutMs: 5000 }
   ```

4. **Verify cookies persisted through navigation**
   ```
   cookies_get { tabId }
   → Verify session_token exists
   ```

---

### Stage 5: DOM Interaction - Login Form

```
Tools: element_query, element_focus, element_html, element_box_model, computer (type)
```

1. **Find email input**
   ```
   element_query { tabId, selector: "#email" }
   → Save nodeId
   ```

2. **Focus email input**
   ```
   element_focus { tabId, nodeId: <email_nodeId> }
   ```

3. **Get element position for typing**
   ```
   element_box_model { tabId, nodeId: <email_nodeId> }
   → Calculate center: x = (content[0] + content[2])/2, y = (content[1] + content[5])/2
   ```

4. **Click and type email**
   ```
   computer { tabId, action: "left_click", coordinate: [x, y] }
   computer { tabId, action: "type", text: "test@example.com" }
   ```

5. **Find and fill password**
   ```
   element_query { tabId, selector: "#password" }
   element_focus { tabId, nodeId: <password_nodeId> }
   computer { tabId, action: "type", text: "secret123" }
   ```

6. **Click login button**
   ```
   element_query { tabId, selector: "#login-btn" }
   element_box_model { tabId, nodeId: <btn_nodeId> }
   computer { tabId, action: "left_click", coordinate: [btn_x, btn_y] }
   ```

7. **Wait for login API response**
   ```
   network_wait_for_response {
     tabId,
     urlRegex: ".*api/login.*",    # Use regex for flexible URL matching
     method: "POST",
     timeoutMs: 5000
   }
   → May timeout if no backend (expected for static test page)
   → In real scenario, validates request was sent with correct headers
   → Alternative: use full URL "http://localhost:8080/api/login"
   ```

8. **Verify login status HTML**
   ```
   element_query { tabId, selector: "#login-status" }
   element_html { tabId, nodeId: <status_nodeId> }
   → Should contain "Logged in as: test@example.com"
   ```

---

### Stage 6: Geolocation Feature Test

```
Tools: element_query, computer (click), javascript_tool
```

1. **Click "Detect Location" button**
   ```
   element_query { tabId, selector: "#location-section button" }
   element_box_model { tabId, nodeId }
   computer { tabId, action: "left_click", coordinate: [x, y] }
   ```

2. **Wait for geolocation API response**
   ```
   # Small delay for geolocation callback
   computer { tabId, action: "wait", text: "1000" }
   ```

3. **Verify location displayed**
   ```
   javascript_tool {
     tabId,
     action: "javascript_exec",
     text: "document.getElementById('location-info').textContent"
   }
   → Should show "Lat: 40.7128, Lng: -74.0060, Accuracy: 10m"
   ```

---

### Stage 7: Product Interaction with Scroll

```
Tools: element_query_all, element_scroll_into_view, element_box_model
```

1. **Find all products**
   ```
   element_query_all { tabId, selector: ".product" }
   → Returns 3 nodeIds
   ```

2. **Scroll to far product (Product 3)**
   ```
   element_query { tabId, selector: "#product-3" }
   element_scroll_into_view { tabId, nodeId: <product3_nodeId> }
   ```

3. **Verify product visible**
   ```
   element_box_model { tabId, nodeId: <product3_nodeId> }
   → y coordinates should be within viewport
   ```

4. **Take screenshot to verify mobile layout**
   ```
   computer { tabId, action: "screenshot" }
   ```

---

### Stage 8: Dialog Handling - Add to Cart

```
Tools: dialog_wait, dialog_handle, element_query, element_box_model
```

1. **Find and get coordinates for "Add to Cart" button**
   ```
   element_query { tabId, selector: "#product-3 button" }
   element_box_model { tabId, nodeId: <button_nodeId> }
   → Calculate center: x = (content[0] + content[2])/2, y = (content[1] + content[5])/2
   ```

2. **Click button (triggers alert dialog)**
   ```
   computer { tabId, action: "left_click", coordinate: [x, y] }
   ```

3. **Wait for alert dialog to appear**
   ```
   dialog_wait { tabId, timeoutMs: 5000, autoHandle: false }
   → Returns { type: "alert", message: "Product 3 added to cart!" }
   ```

4. **Handle the alert dialog**
   ```
   dialog_handle { tabId, accept: true }
   ```

---

### Stage 9: Checkout with Confirmation

```
Tools: dialog_wait, dialog_handle (confirm dialog)
```

1. **Scroll back to checkout**
   ```
   element_query { tabId, selector: "#checkout-btn" }
   element_scroll_into_view { tabId, nodeId }
   ```

2. **Get checkout button coordinates**
   ```
   element_box_model { tabId, nodeId }
   → Calculate center coordinates [x, y]
   ```

3. **Click checkout (triggers confirm dialog)**
   ```
   computer { tabId, action: "left_click", coordinate: [x, y] }
   ```

4. **Wait for confirm dialog**
   ```
   dialog_wait { tabId, timeoutMs: 3000 }
   → Returns { type: "confirm", message: "Complete purchase for $2197?" }
   ```

5. **Decline first purchase**
   ```
   dialog_handle { tabId, accept: false }
   ```

6. **Click checkout again**
   ```
   computer { tabId, action: "left_click", coordinate: [x, y] }
   ```

7. **Wait for confirm dialog again**
   ```
   dialog_wait { tabId, timeoutMs: 3000 }
   ```

8. **Accept purchase (triggers immediate thank-you alert)**
   ```
   # IMPORTANT: The thank-you alert appears IMMEDIATELY after accepting confirm.
   # We must use autoHandle OR run dialog_wait in parallel with dialog_handle.

   # Option A: Use autoHandle for the follow-up alert
   dialog_handle { tabId, accept: true }

   # The thank-you alert appears instantly - wait for it
   dialog_wait { tabId, timeoutMs: 1000 }
   → Returns { type: "alert", message: "Thank you for your purchase!" }
   ```

9. **Dismiss thank you alert**
   ```
   dialog_handle { tabId, accept: true }
   ```

> **NOTE**: If `dialog_wait` misses the alert due to race condition, use
> `dialog_wait { autoHandle: true, action: "accept" }` on step 8 to auto-handle
> the follow-up alert, or ensure your MCP implementation queues dialog events.

---

### Stage 10: File Upload Test

```
Tools: element_query, file_upload, file_chooser_wait, element_box_model
```

#### Method A: Direct File Upload (CDP-based)

1. **Create test file (in WSL)**
   ```bash
   mkdir -p /mnt/c/temp
   echo "Test receipt content" > /mnt/c/temp/receipt.txt
   ```

2. **Find file input**
   ```
   element_query { tabId, selector: "#receipt-upload" }
   → Save nodeId
   ```

3. **Upload file directly via CDP**
   ```
   file_upload {
     tabId,
     nodeId: <input_nodeId>,
     files: ["/mnt/c/temp/receipt.txt"]
   }
   → Path auto-converts to C:\temp\receipt.txt
   ```

4. **Verify file selected**
   ```
   javascript_tool {
     tabId,
     action: "javascript_exec",
     text: "document.getElementById('receipt-upload').files[0]?.name"
   }
   → Should return "receipt.txt"
   ```

#### Method B: Click-Triggered File Chooser

> **IMPORTANT**: Steps 5-6 must run IN PARALLEL to avoid blocking.
> `file_chooser_wait` registers a listener that waits for the file dialog to open.
> The click triggers the dialog. Both must happen concurrently.

5. **Clear previous file selection**
   ```
   javascript_tool {
     tabId,
     action: "javascript_exec",
     text: "document.getElementById('receipt-upload').value = ''"
   }
   ```

6. **Get file input coordinates**
   ```
   element_box_model { tabId, nodeId: <input_nodeId> }
   → Calculate center coordinates [x, y]
   ```

7. **Start file chooser wait AND click in parallel**
   ```
   # PARALLEL EXECUTION REQUIRED:
   # Tool 1: Register file chooser listener
   file_chooser_wait { tabId, timeoutMs: 10000 }

   # Tool 2: Click to trigger file dialog (run simultaneously)
   computer { tabId, action: "left_click", coordinate: [x, y] }

   # file_chooser_wait returns backendNodeId when dialog opens
   ```

8. **Upload file via chooser**
   ```
   file_upload {
     tabId,
     backendNodeId: <from_file_chooser_wait>,
     files: ["/mnt/c/temp/receipt.txt"]
   }
   → Simulates user selecting file in native dialog
   ```

9. **Verify file selected via chooser**
   ```
   javascript_tool {
     tabId,
     action: "javascript_exec",
     text: "document.getElementById('receipt-upload').files[0]?.name"
   }
   → Should return "receipt.txt"
   ```

---

### Stage 11: Console & Error Analysis

```
Tools: console_messages, console_clear
```

1. **Get all console messages**
   ```
   console_messages { tabId, includeLogs: true }
   → Should contain:
     - "User Agent: Mozilla/5.0 (iPhone..."
     - "Platform: iPhone"
     - "Login attempt for: test@example.com"
     - "Geolocation: Lat: 40.7128..."
     - "Added product 3 to cart"
     - "Purchase cancelled" / "Purchase completed!"
   ```

2. **Check for errors**
   ```
   → Filter messages where level === "error"
   → Should be empty (no errors)
   ```

3. **Clear console for next test run**
   ```
   console_clear { tabId }
   ```

---

### Stage 12: Performance Analysis

```
Tools: performance_metrics, page_layout_metrics
```

1. **Get final performance metrics**
   ```
   performance_metrics { tabId }
   → Compare JSHeapUsedSize with baseline
   → Check LayoutCount, RecalcStyleCount for excessive reflows
   ```

2. **Get final layout metrics**
   ```
   page_layout_metrics { tabId }
   → Verify mobile viewport (390x844)
   → Check contentSize for proper mobile layout
   ```

---

### Stage 13: Cleanup & Reset

```
Tools: emulate_device (clear), emulate_geolocation (clear), cookies_clear,
       network_block (clear), network_headers, network_cache
```

> **IMPORTANT**: Reset ALL emulation state to prevent leaking to subsequent tests.

1. **Clear device emulation (viewport, touch, mobile)**
   ```
   emulate_device { tabId, clear: true }
   ```

2. **Clear geolocation override**
   ```
   emulate_geolocation { tabId, clear: true }
   ```

3. **Clear timezone override**
   ```
   # Note: emulate_timezone has no clear option in CDP
   # Set to a neutral/default timezone or leave as-is
   emulate_timezone { tabId, timezoneId: "UTC" }
   ```

4. **Reset user agent to default**
   ```
   # Note: emulate_user_agent has no clear option in CDP
   # Page reload will restore default UA, or set explicitly:
   emulate_user_agent {
     tabId,
     userAgent: ""    # Empty string to reset (implementation-dependent)
   }
   ```

5. **Clear custom network headers**
   ```
   network_headers { tabId, headers: {} }
   → Empty object removes all custom headers
   ```

6. **Clear cookies**
   ```
   cookies_clear { tabId }
   ```

7. **Unblock URLs**
   ```
   network_block { tabId, urls: [] }
   ```

8. **Re-enable cache**
   ```
   network_cache { tabId, disabled: false }
   ```

9. **Page reload to verify clean state**
   ```
   page_reload { tabId, ignoreCache: true }
   ```

---

## Tool Coverage Matrix

**All 30 CDP tools are explicitly executed in this test plan.**

| # | Tool | Stage(s) | Usage |
|---|------|----------|-------|
| 1 | cookies_get | 4 | Verify session cookie |
| 2 | cookies_set | 3 | Set session + tracking tokens |
| 3 | cookies_delete | 3 | Delete tracking cookie (privacy) |
| 4 | cookies_clear | 3, 13 | Fresh session, cleanup |
| 5 | network_headers | 3 | API key, test headers |
| 6 | network_cache | 3, 13 | Disable/enable cache |
| 7 | network_block | 3, 13 | Block analytics |
| 8 | page_reload | 13 | Clean state reload |
| 9 | page_wait_for_load | 4 | Wait for navigation |
| 10 | page_wait_for_network_idle | 4 | Wait for async resources |
| 11 | network_wait_for_response | 5 | Wait for login API request |
| 12 | element_query | 5-10 | Find elements |
| 13 | element_query_all | 7 | Find all products |
| 14 | element_scroll_into_view | 7, 9 | Scroll to elements |
| 15 | element_box_model | 5, 6, 8, 9, 10 | Get click coordinates |
| 16 | element_focus | 5 | Focus form inputs |
| 17 | element_html | 5 | Verify login status |
| 18 | dialog_handle | 8, 9 | Handle alerts/confirms |
| 19 | dialog_wait | 8, 9 | Wait for dialogs |
| 20 | file_upload | 10 | Upload receipt (both methods) |
| 21 | file_chooser_wait | 10 | Click-triggered file chooser |
| 22 | emulate_device | 2, 13 | Mobile viewport |
| 23 | emulate_geolocation | 2 | NYC location |
| 24 | emulate_timezone | 2 | New York timezone |
| 25 | emulate_user_agent | 2 | iPhone user agent |
| 26 | console_enable | 1 | Enable logging |
| 27 | console_messages | 11 | Get all logs |
| 28 | console_clear | 11 | Clear for next run |
| 29 | performance_metrics | 1, 12 | Heap, layout metrics |
| 30 | page_layout_metrics | 1, 12 | Viewport dimensions |

---

## Expected Results

### Success Criteria

- [ ] Mobile viewport renders at 390x844
- [ ] Geolocation shows NYC coordinates
- [ ] Timezone shows America/New_York
- [ ] User agent shows iPhone
- [ ] Login form submits successfully
- [ ] Products scroll into view
- [ ] Dialogs handled correctly
- [ ] File upload works with WSL path conversion
- [ ] Console captures all logs without errors
- [ ] Performance metrics collected
- [ ] All tools respond without CDP errors

### Failure Indicators

- CDP connection errors
- Timeout errors (except expected ones)
- Console errors in captured messages
- Missing nodeIds after navigation
- Incorrect geolocation/timezone values
- File upload path conversion failures

---

## Execution Notes

This test plan is designed for manual execution via Claude Code MCP tools. Each stage can be executed sequentially using the `chrome-bridge` MCP server.

### Prerequisites Checklist
- [ ] Windows host running with Chrome in debug mode
- [ ] `C:\test-pages\ecommerce-test.html` created from template above
- [ ] `C:\temp` directory exists and is writable
- [ ] HTTP server running (e.g., `python -m http.server 8080` in `C:\test-pages`)
- [ ] WSL bridge connected to Windows host
