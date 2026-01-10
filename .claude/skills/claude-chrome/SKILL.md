---
name: claude-chrome
description: Automate tasks using the Claude Chrome extension via UI automation. Use when you need to delegate browser-based work to Claude in Chrome, browse websites, or when the user asks to "use Claude in Chrome" or "send this to the Chrome extension".
allowed-tools: Read, Bash, mcp__chrome-bridge__tabs_context_mcp, mcp__chrome-bridge__computer, mcp__chrome-bridge__javascript_tool, mcp__chrome-bridge__get_page_text
---

# Claude Chrome Extension Automation

Send tasks to the Claude Chrome extension and retrieve results via UI automation.

## Prerequisites
1. chrome-bridge MCP must be connected
2. Claude Chrome extension side panel must be open in Chrome
3. Windows host must be running

## Instructions

### Step 1: Verify Connection
First, check if chrome-bridge is available and get tab context:
```
Use mcp__chrome-bridge__tabs_context_mcp to list tabs
```

Look for the Claude extension tab with URL starting with:
`chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/sidepanel.html`

Save the tab ID for subsequent operations.

### Step 2: Take Screenshot to Assess State
```
Use mcp__chrome-bridge__computer with:
  action: "screenshot"
  tabId: <claude_extension_tab_id>
```

This returns a file path. Use the Read tool to view the screenshot and understand:
- Is Claude ready for input?
- Is there an ongoing conversation?
- Is Claude currently "Working" or "Thinking"?

### Step 3: Send a Message to Claude

#### 3a. Find the chat input coordinates
```
Use mcp__chrome-bridge__javascript_tool with:
  tabId: <claude_extension_tab_id>
  text: |
    (() => {
      const el = document.querySelector('.tiptap.ProseMirror');
      if (el) {
        const rect = el.getBoundingClientRect();
        return JSON.stringify({
          x: Math.round(rect.x + rect.width/2),
          y: Math.round(rect.y + rect.height/2)
        });
      }
      return JSON.stringify({found: false});
    })()
```

#### 3b. Click the input field
```
Use mcp__chrome-bridge__computer with:
  action: "left_click"
  coordinate: [x, y]  // from step 3a
  tabId: <claude_extension_tab_id>
```

#### 3c. Type the message
```
Use mcp__chrome-bridge__computer with:
  action: "type"
  text: "Your task or question here"
  tabId: <claude_extension_tab_id>
```

#### 3d. Find and click the Send button
```
Use mcp__chrome-bridge__javascript_tool with:
  tabId: <claude_extension_tab_id>
  text: |
    (() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const rect = btn.getBoundingClientRect();
        // Send button is in bottom-right area
        if (rect.y > 700 && rect.x > 280 && rect.width < 60) {
          return JSON.stringify({
            x: Math.round(rect.x + rect.width/2),
            y: Math.round(rect.y + rect.height/2)
          });
        }
      }
      return JSON.stringify({found: false});
    })()
```

Then click:
```
Use mcp__chrome-bridge__computer with:
  action: "left_click"
  coordinate: [x, y]  // Send button coordinates
  tabId: <claude_extension_tab_id>
```

### Step 4: Wait for Claude to Complete

Take periodic screenshots to check status. Look for:
- "Working" or "Thinking..." indicates Claude is processing
- New response text indicates completion

Use `mcp__chrome-bridge__computer action=wait` to pause between checks.

### Step 5: Read the Response
```
Use mcp__chrome-bridge__get_page_text with:
  tabId: <claude_extension_tab_id>
```

Parse the returned text to extract Claude's response.

## Example Usage

**User request:** "Use Claude in Chrome to check the weather in Tokyo"

**Execution:**
1. Get tabs, find Claude extension tab ID
2. Screenshot to verify ready state
3. Click input at (~175, 732)
4. Type: "Go to weather.com and tell me the current weather in Tokyo"
5. Click Send button at (~312, 814)
6. Wait 10-30 seconds
7. Screenshot to check if complete
8. get_page_text to read response
9. Summarize results to user

## Key Information

### CSS Selectors
- Chat input: `.tiptap.ProseMirror`
- Message bubbles: Check page text for conversation content

### Typical Coordinates (may vary by viewport)
- Chat input: approximately (175, 732)
- Send button: approximately (312, 814)

### Extension Details
- Extension ID: `fcoeoabgfenejglbffodgkkbkcdhcgfn`
- Side panel URL: `chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/sidepanel.html`
- Editor: TipTap/ProseMirror (contenteditable div)

## Troubleshooting

### "Not connected to Chrome extension"
- Run the start-all.ps1 script to start Windows host
- Ensure Chrome has debugging enabled on port 9222

### Can't find input/button
- Take a fresh screenshot to see current UI state
- Coordinates may shift if viewport size changed
- Re-run JavaScript to get updated coordinates

### Claude not responding
- Check if "Act without asking" is enabled
- Claude may be rate-limited
- Take screenshot to see error messages

## Notes
- Screenshots are saved to `/tmp/claude-chrome-screenshots/`
- Use Read tool to view screenshot images directly
- The Claude extension can browse web, take actions, and interact with pages
- Results should be summarized back to the user
