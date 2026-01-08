# Claude Code Chrome Bridge (WSL to Windows)

Bridge Claude Code running in WSL with Chrome running on Windows, enabling browser automation across the OS boundary using Chrome DevTools Protocol (CDP).

## Problem

Claude Code's `--chrome` flag enables powerful browser automation through the "Claude in Chrome" extension. However, this feature fails on WSL with:

```
Error: Claude in Chrome Native Host not supported on this platform
```

This project solves that by creating a bridge using Chrome DevTools Protocol.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WINDOWS                                         │
│                                                                              │
│  ┌──────────────┐    CDP (9222)    ┌──────────────────────────────────────┐ │
│  │    Chrome    │◄────────────────►│         Windows Host                 │ │
│  │  (with CDP)  │                  │         (Node.js)                    │ │
│  │              │                  │  - WebSocket server on 0.0.0.0:19222 │ │
│  └──────────────┘                  │  - CDP client to Chrome              │ │
│                                    └──────────────────────────────────────┘ │
│                                                    ▲                         │
│                                                    │ WebSocket               │
└────────────────────────────────────────────────────│─────────────────────────┘
                                                     │
┌────────────────────────────────────────────────────│─────────────────────────┐
│                               WSL                  │                         │
│                                                    ▼                         │
│  ┌─────────────────┐  MCP    ┌─────────────────────────────────────────┐    │
│  │   Claude Code   │◄───────►│           MCP Server                    │    │
│  │   (unmodified)  │  stdio  │  - Handles MCP protocol                 │    │
│  │                 │         │  - Forwards to Windows via WebSocket    │    │
│  └─────────────────┘         └─────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Supported Browser Tools (39 Total)

### Core Tools
| Tool | Description |
|------|-------------|
| `tabs_context_mcp` | Get list of browser tabs |
| `tabs_create_mcp` | Create a new tab |
| `navigate` | Navigate to a URL |
| `computer` | Mouse/keyboard actions, screenshots |
| `read_page` | Get accessibility tree |
| `get_page_text` | Extract page text content |
| `javascript_tool` | Execute JavaScript |
| `find` | Find elements on page |
| `form_input` | Fill form fields |

### Cookies & Network Tools
| Tool | Description |
|------|-------------|
| `cookies_get` | Get cookies for current page or URLs |
| `cookies_set` | Set one or more cookies |
| `cookies_delete` | Delete a specific cookie |
| `cookies_clear` | Clear all browser cookies |
| `network_headers` | Set extra HTTP headers |
| `network_cache` | Enable/disable network cache |
| `network_block` | Block URLs matching patterns |
| `page_reload` | Reload the current page |
| `page_wait_for_load` | Wait for page load event |
| `page_wait_for_network_idle` | Wait for network idle |
| `network_wait_for_response` | Wait for specific response |

### DOM Tools
| Tool | Description |
|------|-------------|
| `element_query` | Find element by CSS selector |
| `element_query_all` | Find all matching elements |
| `element_scroll_into_view` | Scroll element into viewport |
| `element_box_model` | Get element position/dimensions |
| `element_focus` | Focus an element |
| `element_html` | Get element's outer HTML |

### Dialog & File Tools
| Tool | Description |
|------|-------------|
| `dialog_handle` | Accept/dismiss JS dialogs |
| `dialog_wait` | Wait for dialog to appear |
| `file_upload` | Upload files (WSL paths auto-converted) |
| `file_chooser_wait` | Wait for file chooser |

### Emulation Tools
| Tool | Description |
|------|-------------|
| `emulate_device` | Set viewport, mobile mode, touch |
| `emulate_geolocation` | Override geolocation |
| `emulate_timezone` | Override timezone |
| `emulate_user_agent` | Override user agent |

### Console & Performance Tools
| Tool | Description |
|------|-------------|
| `console_enable` | Enable console capture |
| `console_messages` | Get captured messages |
| `console_clear` | Clear console messages |
| `performance_metrics` | Get performance metrics |
| `page_layout_metrics` | Get viewport dimensions |

## Prerequisites

- Windows 10/11 with WSL2
- Google Chrome installed on Windows
- Node.js installed on both Windows and WSL
- Claude Code installed in WSL

## Installation

### Step 1: Clone the repository (in WSL)

```bash
cd ~/projects
git clone https://github.com/pinkpixel-dev/claude-code-chrome-wsl-windows.git
cd claude-code-chrome-wsl-windows
```

### Step 2: Install WSL dependencies

```bash
cd wsl-bridge
npm install
```

### Step 3: Copy Windows host to Windows filesystem

```bash
# From WSL, copy to Windows
cp -r ../windows-host /mnt/c/Users/$USER/projects/claude-chrome-bridge/
```

Or in PowerShell:
```powershell
mkdir C:\Users\$env:USERNAME\projects\claude-chrome-bridge -Force
Copy-Item -Recurse "\\wsl$\Ubuntu\home\YOUR_WSL_USERNAME\projects\claude-code-chrome-wsl-windows\windows-host\*" "C:\Users\$env:USERNAME\projects\claude-chrome-bridge\windows-host\"
```

### Step 4: Install Windows dependencies

```powershell
cd C:\Users\$env:USERNAME\projects\claude-chrome-bridge\windows-host
npm install
```

### Step 5: Configure Claude Code MCP

Create `~/.mcp.json` in WSL:

```json
{
  "mcpServers": {
    "chrome-bridge": {
      "command": "node",
      "args": ["/home/YOUR_USERNAME/projects/claude-code-chrome-wsl-windows/wsl-bridge/src/mcp-server.js"],
      "env": {
        "WINDOWS_HOST_IP": "YOUR_WINDOWS_IP"
      }
    }
  }
}
```

Find your Windows IP from WSL:
```bash
ip route | grep default | awk '{print $3}'
```

## Usage

### Quick Start

**Terminal 1 (PowerShell) - Start Chrome:**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=C:\Users\$env:USERNAME\chrome-debug-profile
```

**Terminal 2 (PowerShell) - Start Windows Host:**
```powershell
cd C:\Users\$env:USERNAME\projects\claude-chrome-bridge\windows-host
node src/index.js
```

**Terminal 3 (WSL) - Start Claude Code:**
```bash
claude
```

Browser tools now work!

### Using Helper Scripts

After installation, you can use the provided scripts:

**PowerShell:**
```powershell
# Start Chrome with debugging
.\start-chrome.ps1

# Start the Windows host
.\start-host.ps1
```

## Troubleshooting

### Chrome not connecting (ECONNREFUSED on port 9222)

Chrome must be started with `--remote-debugging-port=9222`. Close ALL Chrome processes first:

```powershell
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
Start-Sleep 2
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=C:\Users\$env:USERNAME\chrome-debug-profile
```

**Important:** Use `--user-data-dir` to ensure a clean profile that enables debugging.

### WebSocket connection failed from WSL

WSL2 cannot use `127.0.0.1` to reach Windows. Get the correct IP:

```bash
ip route | grep default | awk '{print $3}'
```

Update `WINDOWS_HOST_IP` in `~/.mcp.json`.

### Port 19222 already in use

```powershell
Stop-Process -Name node -Force
```

### MCP server not connecting

Restart Claude Code:
```bash
exit
claude
```

## Log Files

| Log | Location |
|-----|----------|
| Windows startup | `C:\Users\YOUR_USERNAME\claude-bridge-startup.log` |
| Windows detailed | `%TEMP%\claude-chrome-bridge.log` |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WINDOWS_HOST_IP` | Auto-detected | Windows host IP for WebSocket |
| `WS_PORT` | 19222 | WebSocket server port |
| `CDP_PORT` | 9222 | Chrome DevTools Protocol port |

## Project Structure

```
claude-code-chrome-wsl-windows/
├── README.md
├── wsl-bridge/
│   ├── package.json
│   └── src/
│       └── mcp-server.js      # MCP server for Claude Code
└── windows-host/
    ├── package.json
    ├── start-chrome.ps1       # Helper to start Chrome
    ├── start-host.ps1         # Helper to start host
    └── src/
        ├── index.js           # Main Windows host
        ├── cdp-client.js      # Chrome DevTools Protocol client
        └── websocket-server.js # WebSocket server
```

## How It Works

1. **Chrome** runs on Windows with `--remote-debugging-port=9222`
2. **Windows Host** connects to Chrome via CDP and listens on port 19222
3. **MCP Server** in WSL connects to Windows Host via WebSocket
4. **Claude Code** communicates with MCP Server via stdio
5. Tool calls flow: Claude Code → MCP → WebSocket → Windows Host → CDP → Chrome

## License

MIT
