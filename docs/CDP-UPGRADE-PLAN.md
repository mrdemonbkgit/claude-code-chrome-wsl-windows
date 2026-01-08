# Chrome Bridge CDP Upgrade Research

## Current Implementation Summary

The bridge currently implements a subset of CDP:
- **Target Management**: `/json/list`, `/json/new`, `/json/close`
- **Page**: `navigate`, `captureScreenshot`
- **Runtime**: `evaluate` (for JS execution, text extraction)
- **Input**: `dispatchMouseEvent`, `dispatchKeyEvent`
- **Accessibility**: `getFullAXTree` (limited to 100 nodes)

## CDP Domains Available for Upgrade

### High Priority - Network Domain
| Method | Use Case |
|--------|----------|
| `Network.getCookies` | Read cookies for auth state |
| `Network.setCookie` | Set auth tokens/session cookies |
| `Network.deleteCookies` | Clear specific cookies |
| `Network.clearBrowserCookies` | Full cookie reset |
| `Network.setExtraHTTPHeaders` | Add auth headers to all requests |
| `Network.setBlockedURLs` | Block ads/analytics during testing |
| `Network.setCacheDisabled` | Ensure fresh content in tests |
| `Network.getResponseBody` | Inspect API responses |

### High Priority - Page Domain (New Methods)
| Method | Use Case |
|--------|----------|
| `Page.printToPDF` | Generate PDF reports |
| `Page.reload` | Refresh with optional cache bypass |
| `Page.handleJavaScriptDialog` | Auto-dismiss alerts/confirms/prompts |
| `Page.setInterceptFileChooserDialog` | Handle file upload inputs |
| `Page.addScriptToEvaluateOnNewDocument` | Inject scripts before page load |
| `Page.getLayoutMetrics` | Get viewport/scroll dimensions |
| `Page.bringToFront` | Activate tab |

### High Priority - DOM Domain
| Method | Use Case |
|--------|----------|
| `DOM.querySelector` | Native element queries (faster than JS) |
| `DOM.querySelectorAll` | Find multiple elements |
| `DOM.getBoxModel` | Get element position/size |
| `DOM.scrollIntoViewIfNeeded` | Scroll element into view |
| `DOM.setFileInputFiles` | Handle file uploads properly |
| `DOM.focus` | Focus specific elements |
| `DOM.getOuterHTML` | Get element HTML |
| `DOM.performSearch` | Search with XPath support |

### Medium Priority - Emulation Domain
| Method | Use Case |
|--------|----------|
| `Emulation.setDeviceMetricsOverride` | Mobile/tablet testing |
| `Emulation.setUserAgentOverride` | Test different browsers |
| `Emulation.setGeolocationOverride` | Location-based testing |
| `Emulation.setTimezoneOverride` | Timezone testing |
| `Emulation.setLocaleOverride` | i18n testing |
| `Emulation.setTouchEmulationEnabled` | Touch device testing |

### Medium Priority - Storage Domain
| Method | Use Case |
|--------|----------|
| `Storage.clearDataForOrigin` | Clean slate for tests |
| `Storage.getUsageAndQuota` | Monitor storage usage |

### Lower Priority - Console/Logging
| Method | Use Case |
|--------|----------|
| `Console.enable` | Capture console.log output |
| `Log.enable` | Capture browser logs |

### Lower Priority - Performance
| Method | Use Case |
|--------|----------|
| `Performance.enable` | Gather performance metrics |
| `Performance.getMetrics` | Get timing data |

## Recommended New MCP Tools

### Phase 1 - Essential Additions
1. **`cookies_get`** - Get cookies for current page/domain
2. **`cookies_set`** - Set a cookie
3. **`cookies_clear`** - Clear cookies
4. **`page_reload`** - Reload page
5. **`page_pdf`** - Print page to PDF
6. **`dialog_handle`** - Accept/dismiss JS dialogs
7. **`file_upload`** - Set files on file input elements

### Phase 2 - Enhanced Element Interaction
8. **`element_query`** - Native DOM querySelector
9. **`element_scroll_into_view`** - Scroll element visible
10. **`element_box_model`** - Get element bounds
11. **`element_focus`** - Focus an element

### Phase 3 - Emulation
12. **`emulate_device`** - Set viewport/mobile mode
13. **`emulate_geolocation`** - Set GPS coordinates
14. **`emulate_timezone`** - Set timezone

### Phase 4 - Advanced
15. **`network_headers`** - Set extra HTTP headers
16. **`network_block`** - Block URL patterns
17. **`console_messages`** - Get console output
18. **`performance_metrics`** - Get performance data

## Implementation Files to Modify

1. **`windows-host/src/cdp-client.js`** - Add new CDP method wrappers
2. **`windows-host/src/tools/`** - Add new tool handlers
3. **`windows-host/src/index.js`** - Register new tools
4. **`wsl-bridge/src/mcp-server.js`** - Expose new MCP tools

## Event Subscriptions to Add

Currently the implementation doesn't subscribe to CDP events. Useful events:
- `Page.javascriptDialogOpening` - Auto-handle dialogs
- `Page.fileChooserOpened` - Handle file uploads
- `Console.messageAdded` - Capture logs
- `Network.requestWillBeSent` - Request monitoring

---

## Codex Review Findings (Verified)

### Critical Issues Identified

| Severity | Issue | Mitigation |
|----------|-------|------------|
| **High** | Event-driven features require `*.enable` calls + event pump | Add `Network.enable`, `Page.enable`, `DOM.enable` before using domain methods |
| **High** | `Network.getResponseBody` needs `requestId` from events | Must subscribe to `Network.requestWillBeSent`/`responseReceived` and store metadata |
| **High** | DOM nodeIds invalidated on navigation (`DOM.documentUpdated` event) | Call `DOM.getDocument` after each navigation; re-resolve nodeIds |
| **Medium** | `DOM.setFileInputFiles` needs Windows paths | Implement WSL→Windows path translation or file staging to temp dir |
| **Medium** | `Network.setCookie` deprecated | Use `Network.setCookies` (plural) instead |
| **Medium** | Geolocation overrides may need `Browser.grantPermissions` | Grant `geolocation` permission before setting override |
| **Low** | Injected scripts persist across tests | Pair `addScriptToEvaluateOnNewDocument` with cleanup |

### Missing Methods to Add (from Codex)

**Required Enable Methods:**
- `Network.enable`, `Page.enable`, `DOM.enable`, `Runtime.enable`
- `Console.enable`, `Log.enable`, `Performance.enable`

**Navigation/Wait Helpers:**
- `Page.loadEventFired` - Wait for page load
- `Page.stopLoading` - Cancel navigation

**DOM Lifecycle:**
- `DOM.getDocument` - Get root node (required before queries)
- `DOM.resolveNode` - Convert nodeId to RemoteObjectId
- `DOM.getSearchResults` / `DOM.discardSearchResults` - For XPath/performSearch

**Multi-Target Support:**
- `Target.attachToTarget` - Attach to popups/iframes
- `Target.setAutoAttach` - Auto-attach to new targets
- `Browser.grantPermissions` - Grant permissions for geo/notifications

### Revised Implementation Order (from Codex)

1. **Core Plumbing** - Per-target session routing + `*.enable` calls + event queue
2. **Network/Cookies** - `Network.enable`, cookie CRUD, cache control, response body
3. **DOM Primitives** - `DOM.getDocument`, querySelector, getBoxModel, scrollIntoView
4. **Dialogs/Files** - Event subscription + handleJavaScriptDialog + file staging
5. **Emulation** - Device metrics, UA, geolocation/timezone + permissions
6. **Logging/Perf** - Console/Log events, Performance.getMetrics

### Open Design Questions

1. **Multi-target support?** - Single page only or popups/iframes? Affects `Target.setAutoAttach` need
2. **Event delivery model?** - MCP is request/response; how to deliver async events (dialogs, console)?
3. **File upload paths?** - Copy WSL files to Windows temp, or require Windows paths?

---

## Codex xHigh Reasoning Review (Second Pass)

### Additional Gotchas Identified

| Severity | Issue | Mitigation |
|----------|-------|------------|
| **High** | Event backpressure - events can be dropped without bounded queue | Implement dedicated reader loop + bounded queue (max 1000) |
| **High** | `Network.getResponseBody` buffer eviction | Use `Network.enable({ maxResourceBufferSize, maxTotalBufferSize })` + handle "No data found" errors |
| **High** | Iframe/execution-context not addressed | Must target correct `executionContextId` or `frameId` for Runtime/DOM calls |
| **Medium** | DOM APIs fail on detached/hidden nodes (`nodeId=0`) | Add retry logic + re-query after `scrollIntoViewIfNeeded` |
| **Medium** | Shadow DOM gap - `DOM.querySelector` won't pierce | Use `DOM.performSearch` with `includeUserAgentShadowDOM` or Runtime fallback |
| **Medium** | `DOM.performSearch` leaks memory | Must pair with `DOM.discardSearchResults` |
| **Medium** | `fileChooserOpened` requires user gesture, per-target | Re-enable after new targets; handle multiple dialogs |
| **Low** | Cookie APIs drift across Chrome versions | Plan fallback to `Storage.getCookies/setCookies` |

### Code Patterns from Codex

**Event Handling Pattern:**
```js
class CdpClient {
  constructor(ws) {
    this.pending = new Map();
    this.listeners = new Map(); // sessionKey -> Set<fn>
    this.queue = [];
    this.maxQueue = 1000;
  }

  waitForEvent(sessionKey, method, { timeoutMs = 30000, filter } = {}) {
    return new Promise((resolve, reject) => {
      const off = this.on(sessionKey, (evt) => {
        if (evt.method !== method) return;
        if (filter && !filter(evt.params)) return;
        clearTimeout(timer);
        off();
        resolve(evt.params);
      });
      const timer = setTimeout(() => { off(); reject(new Error("timeout")); }, timeoutMs);
    });
  }
}
```

**NodeId Lifecycle Pattern:**
```js
let docVersion = 0;
cdp.on("root", (evt) => {
  if (evt.method === "DOM.documentUpdated") docVersion++;
  if (evt.method === "Page.frameNavigated" && !evt.params.frame.parentId) docVersion++;
});

async function querySelector(selector) {
  const { root } = await cdp.send("DOM.getDocument", { depth: 1, pierce: true });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  return { nodeId, selector, docVersion };
}
```

**File Path Translation (WSL→Windows):**
```js
function toWindowsPath(posixPath) {
  if (posixPath.startsWith("/mnt/")) {
    const parts = posixPath.split("/");
    const drive = parts[2].toUpperCase();
    return `${drive}:\\${parts.slice(3).join("\\")}`;
  }
  // Stage to Windows temp for non-/mnt paths
  return stageToWindowsTemp(posixPath);
}
```

### MCP Event Delivery Solutions

Since MCP is request/response, Codex suggests:

1. **`events_next`** - Fetch buffered events with cursor/sequence (poll-based)
2. **`events_wait`** - Long-poll with timeout until event arrives
3. **Server-side wait helpers** - `page_wait_for_load`, `network_wait_for_response` that use internal event pump (preferred - hides complexity from client)
4. **MCP notifications** - If supported, emit `cdp.event` but still buffer for replay

### Security Considerations

| Area | Recommendation |
|------|----------------|
| **Cookies/Headers/Bodies** | Redact logs, cap retention, don't return full bodies by default |
| **File Uploads** | Allowlist directories, reject symlinks, avoid `\\wsl$` unless explicit |
| **Script Injection** | Require opt-in, scope to allowed origins |
| **Permissions** | Origin-scoped, clear after use |
| **Event Queues** | Size limits + throttle high-volume domains (Network, Log) |

---

## Server-Side Wait Helper Signatures (from Codex)

These tools hide CDP event complexity from the MCP client by handling event subscriptions internally:

| Tool | Params (object) | Description |
|---|---|---|
| `page_wait_for_load` | `{ waitUntil?: "load" \| "domcontentloaded", frameId?: string, timeoutMs?: number }` | Waits for the chosen page lifecycle event on the top-level frame (or specified `frameId`) and returns the event params. |
| `page_wait_for_network_idle` | `{ idleMs?: number, timeoutMs?: number, maxInflight?: number }` | Waits until network activity falls to `maxInflight` (default 0) for `idleMs`, using internal request/response tracking. |
| `network_wait_for_response` | `{ url?: string, urlRegex?: string, method?: string, status?: number, resourceType?: string, timeoutMs?: number }` | Waits for the next matching `Network.responseReceived` and returns response metadata + `requestId`. |
| `dialog_wait` | `{ timeoutMs?: number, action?: "accept" \| "dismiss", promptText?: string }` | Waits for `Page.javascriptDialogOpening`; optionally auto-handles the dialog and returns dialog details. |
| `file_chooser_wait` | `{ timeoutMs?: number }` | Waits for `Page.fileChooserOpened` and returns target node metadata needed for follow-up file upload. |

---

## Codex Fourth Pass Review (Verified)

### Plan Gaps Identified

| Gap | Issue |
|-----|-------|
| **Missing scheduled methods** | `Network.getResponseBody`, `Page.addScriptToEvaluateOnNewDocument`, `Page.getLayoutMetrics`, `DOM.performSearch` are in high-priority list but not in phased tool list |
| **Lifecycle events missing** | Need `Page.setLifecycleEventsEnabled` for frame-scoped load/idle checks |
| **Cookie strategy inconsistent** | Lists deprecated `Network.setCookie`; should commit to `Network.setCookies` |
| **Object handle leaks** | Missing `Runtime.releaseObject`/`Runtime.releaseObjectGroup` cleanup |
| **Iframe handling incomplete** | Need `Runtime.executionContextCreated`/`Page.frameNavigated` mapping + `DOM.getFrameOwner` |

### Wait Helper Refinements

| Helper | Issue | Fix |
|--------|-------|-----|
| `page_wait_for_load` | `frameId` requires `Page.lifecycleEvent` (not `loadEventFired`) | Use `Page.setLifecycleEventsEnabled` + `Page.lifecycleEvent` for frame-scoped waits |
| `page_wait_for_network_idle` | Rolling own tracker needs `requestWillBeSent`, `loadingFinished`, `loadingFailed` | Or use `Page.lifecycleEvent` names `networkIdle`/`networkAlmostIdle` |
| `network_wait_for_response` | Missing `frameId` filter | Add `frameId?: string` to params |
| `dialog_wait` | `promptText` only valid for `type === "prompt"` | Return `type`, `message`, `defaultPrompt`, `url` in response |
| `file_chooser_wait` | Needs explicit enable | Require `Page.setInterceptFileChooserDialog({enabled:true})`; return `backendNodeId`, `mode`, `frameId` |

### Revised Implementation Order

1. **Phase 0 - Core Plumbing** (before all else)
   - Session routing + `Target.setAutoAttach` + event pump
   - `Page.enable`, `Runtime.enable`, `Network.enable`, `DOM.enable`
   - `Page.setLifecycleEventsEnabled` for wait helpers
   - `Runtime.executionContextCreated` mapping for frames

2. **Phase 1 - Auth & Navigation** (promoted from Phase 4)
   - `network_headers` - Set extra HTTP headers for auth
   - Cookie tools (`Network.setCookies`, `Network.getCookies`, `Network.deleteCookies`)
   - `page_reload`, basic wait helpers

3. **Phase 2 - DOM** (after execution context mapping)
   - `DOM.getDocument`, querySelector, getBoxModel, scrollIntoView
   - `Runtime.releaseObjectGroup` for handle cleanup

4. **Phase 3 - Dialogs/Files**
   - `Page.setInterceptFileChooserDialog` + `file_chooser_wait`
   - `dialog_wait` + `Page.handleJavaScriptDialog`

5. **Phase 4 - Emulation**
   - Device metrics, UA, geolocation (with `Browser.grantPermissions`)

6. **Phase 5 - Logging/Performance**
   - Console/Log events, Performance.getMetrics

### Chrome Compatibility Notes (Verified)

| Method | Concern | Mitigation |
|--------|---------|------------|
| `Network.setCookie` | Only `success` return is deprecated (method still works) | Use `Network.setCookies` (plural) for future-proofing |
| `Network.enable` | `maxResourceBufferSize`, `maxTotalBufferSize` are Experimental | Set these to reduce "No data found" errors in `getResponseBody` |
| `Page.printToPDF` | Only works in headless mode | Feature-detect with `Browser.getVersion` or skip in headful |
| `Page.fileChooserOpened` | Returns `frameId`, `mode`, `backendNodeId` | Confirmed in docs |
| Emulation overrides | May not exist in older Chromium | Use `Schema.getDomains` for feature detection |

### Race Condition Mitigations

| Scenario | Mitigation |
|----------|------------|
| **Event missed before listener** | Buffer events during connection, register wait before triggering action |
| **Network idle hangs on WebSocket** | Exclude `resourceType: "WebSocket"` or allow `maxInflight > 0` |
| **NodeId stale after navigation** | Re-query on `DOM.documentUpdated` or `Page.frameNavigated`; guard for `nodeId=0` |
| **File chooser timeout** | Auto-disable intercept on timeout to avoid hung dialog |
| **getResponseBody fails** | Handle 204/304/cached/data URLs gracefully with structured error |

---

## Sources
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Getting Started with CDP](https://github.com/aslushnikov/getting-started-with-cdp)
- [CDP Command Editor](https://developer.chrome.com/blog/cdp-command-editor)
