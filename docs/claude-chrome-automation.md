# Claude Chrome Extension Automation Research

## Architecture Discovery

### Components

1. **Claude Chrome Extension** (v1.0.36)
   - Extension ID: `fcoeoabgfenejglbffodgkkbkcdhcgfn`
   - Location: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\fcoeoabgfenejglbffodgkkbkcdhcgfn\`
   - Permissions: sidePanel, storage, activeTab, scripting, debugger, tabGroups, tabs, nativeMessaging, etc.
   - `externally_connectable`: Only claude.ai domains (can't send messages from arbitrary pages)

2. **Native Messaging Host**
   - Binary: `chrome-native-host.exe`
   - Location: `%LOCALAPPDATA%\AnthropicClaude\app-{version}\resources\`
   - Manifest: `%APPDATA%\Claude\ChromeNativeHost\com.anthropic.claude_browser_extension.json`
   - Written in Rust, uses serde_json

3. **Named Pipe Bridge**
   - Pipe name: `\\.\pipe\claude-mcp-browser-bridge-{USERNAME}`
   - Protocol: Custom JSON with 32-bit length prefix
   - Acts as MCP bridge between clients and Chrome extension

### Message Flow

```
MCP Clients <--Named Pipe--> chrome-native-host.exe <--Native Messaging--> Chrome Extension
```

### Known Message Types

From service worker analysis:
- `tool_request` - Request to execute a tool (method: "execute_tool")
- `tool_response` - Response from tool execution
- `status_response` - Status information
- `mcp_connected` / `mcp_disconnected` - Connection events
- `ping` / `pong` - Health check

### ToolRequest Structure

```json
{
  "type": "tool_request",
  "method": "execute_tool",
  "params": {
    "tool": "tool_name",
    "client_id": "unique-id",
    "args": { ... }
  }
}
```

## Viable Automation Strategies

### Strategy 1: UI Automation via chrome-bridge MCP (Recommended for WSL)

Use existing chrome-bridge to control the extension's side panel UI.

**Pros:**
- Works now with existing tools
- No protocol reverse engineering needed
- Full access to extension capabilities

**Cons:**
- Indirect (UI manipulation)
- Slower than direct API
- Dependent on UI structure

**Implementation:**
```javascript
// Open side panel
await computer({ action: "key", text: "ctrl+e", tabId });

// Type command in chat input
await find({ query: "chat input", tabId });
await form_input({ ref: "...", value: "your command", tabId });

// Press Enter to send
await computer({ action: "key", text: "Return", tabId });
```

### Strategy 2: Windows Claude Code CLI Wrapper

Run Claude Code on Windows and pipe commands programmatically.

**Pros:**
- Official integration path
- Stable protocol
- Full capabilities

**Cons:**
- Requires Windows-side execution
- Need process management from WSL

**Implementation:**
```powershell
# From WSL
powershell.exe -Command "claude --chrome --print 'your command here'"
```

Or create a persistent Windows process:
```powershell
# PowerShell script running Claude Code as a service
$process = Start-Process -FilePath "claude" -ArgumentList "--chrome" -PassThru -NoNewWindow
# Communicate via stdin/stdout
```

### Strategy 3: Named Pipe Direct Client

Create a client that speaks the native host protocol directly.

**Pros:**
- Direct access, no UI dependency
- Fast execution
- Programmatic control

**Cons:**
- Protocol not documented
- May break with updates
- Needs more reverse engineering

**Current Status:**
- Pipe connection works
- Basic message format understood
- Need to discover exact tool invocation protocol

**Test Script:** `test-mcp-bridge.ps1`

### Strategy 4: Helper Chrome Extension

Create a Chrome extension that interfaces with Claude extension.

**Pros:**
- Can use Chrome APIs directly
- More stable than UI automation
- Can intercept/augment requests

**Cons:**
- Development effort
- Extension-to-extension communication limitations
- Maintenance burden

## Recommendations

1. **For immediate use**: Strategy 1 (UI Automation) - Works today with chrome-bridge
2. **For robust automation**: Strategy 2 (Windows CLI Wrapper) - Official path
3. **For deep integration**: Strategy 3 (Named Pipe) - Requires more research

## Files Created

- `test-mcp-bridge.ps1` - Tests named pipe connection
- `probe-mcp-methods.ps1` - Probes for valid methods
- `test-ping.ps1` - Tests ping message
- `test-tool-request.ps1` - Tests tool request format

## Next Steps

1. Test UI automation approach with chrome-bridge
2. Create Windows PowerShell wrapper for Claude Code CLI
3. Continue protocol analysis for direct pipe access
