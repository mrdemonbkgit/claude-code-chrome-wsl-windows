# Project Instructions for Claude Code

## E2E / Browser Testing

This project uses browser automation for E2E testing via the Chrome Bridge (WSL to Windows).

### Before Running Browser Tests

**Always check and start the bridge automatically before E2E tests:**

```bash
# Step 1: Get Windows host IP
WINDOWS_IP=$(ip route | grep default | awk '{print $3}')

# Step 2: Check if bridge is running
nc -zv $WINDOWS_IP 19222 2>&1 | grep -q "succeeded"
```

**If the connection fails, start the bridge from WSL:**
```bash
# Start Chrome Bridge on Windows (run from WSL)
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\Tony\projects\claude-chrome-bridge\windows-host\start-all.ps1"
```

**Then verify it's running:**
```bash
# Wait a moment for startup, then verify
sleep 5
nc -zv $WINDOWS_IP 19222
```

**Important:** Always run these checks automatically when E2E testing is requested. Do not ask the user to start the bridge manually - start it yourself using the powershell.exe command above.

### Available Browser Tools

Once the bridge is running, these MCP tools are available:

| Tool | Description | Example |
|------|-------------|---------|
| `mcp__chrome-bridge__tabs_context_mcp` | Get browser tabs | `{createIfEmpty: true}` |
| `mcp__chrome-bridge__navigate` | Go to URL | `{url: "http://localhost:3000", tabId: 0}` |
| `mcp__chrome-bridge__computer` | Screenshot/click/type | `{action: "screenshot", tabId: 0}` |
| `mcp__chrome-bridge__get_page_text` | Extract page text | `{tabId: 0}` |
| `mcp__chrome-bridge__javascript_tool` | Run JavaScript | `{action: "javascript_exec", text: "document.title", tabId: 0}` |
| `mcp__chrome-bridge__find` | Find elements | `{query: "button", tabId: 0}` |
| `mcp__chrome-bridge__form_input` | Fill form fields | `{ref: "element-0", value: "test", tabId: 0}` |
| `mcp__chrome-bridge__tabs_create_mcp` | Create new tab | `{}` |
| `mcp__chrome-bridge__read_page` | Get accessibility tree | `{tabId: 0}` |

### E2E Test Workflow

0. **Ensure bridge is running (do this automatically):**
   ```bash
   WINDOWS_IP=$(ip route | grep default | awk '{print $3}')
   nc -zv $WINDOWS_IP 19222 2>&1 | grep -q "succeeded" || powershell.exe -ExecutionPolicy Bypass -File "C:\Users\Tony\projects\claude-chrome-bridge\windows-host\start-all.ps1"
   ```

1. **Get tabs and tabId:**
   ```
   tabs_context_mcp with createIfEmpty: true
   ```

2. **Navigate to the app:**
   ```
   navigate to http://localhost:3000 with the tabId
   ```

3. **Interact and verify:**
   - Take screenshots to see current state
   - Use get_page_text to verify content
   - Use javascript_tool to check elements
   - Use computer with action: "left_click" to click

### Example Test Scenarios

When asked to run E2E tests, follow this pattern:

```
0. Check bridge connectivity, start if needed (automatic - don't ask user)
1. Start by getting tabs (tabs_context_mcp)
2. Navigate to the test URL
3. Wait briefly if needed (computer action: "wait")
4. Take screenshot to see initial state
5. Perform test actions (click, type, etc.)
6. Verify results with screenshots or get_page_text
7. Report pass/fail with evidence
```

### Common Test Commands

**Test login flow:**
```
Navigate to /login
Fill email input with test@example.com
Fill password input with password123
Click login button
Verify redirect to /dashboard
```

**Test form validation:**
```
Navigate to /signup
Click submit without filling fields
Verify error messages appear
```

**Visual regression:**
```
Navigate to each page
Take screenshots
Compare with expected layout
```

---

## Development Server

<!-- Update this section for your project -->

```bash
# Start development server
npm run dev

# The app runs at http://localhost:3000
```

## Test Data

<!-- Add test accounts/data here -->

- Test user: test@example.com / password123
- Admin user: admin@example.com / admin123
