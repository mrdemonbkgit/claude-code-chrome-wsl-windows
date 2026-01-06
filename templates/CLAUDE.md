# Project Instructions for Claude Code

## E2E / Browser Testing

This project uses browser automation for E2E testing via the Chrome Bridge (WSL to Windows).

### Before Running Browser Tests

**Check if the bridge is running:**
```bash
nc -zv $(ip route | grep default | awk '{print $3}') 19222
```

If it shows "Connection refused", ask the user to start the bridge:

> **User Action Required:** Please run this command in PowerShell to start the Chrome bridge:
> ```powershell
> C:\Users\Tony\projects\claude-chrome-bridge\windows-host\start-all.ps1
> ```

### Available Browser Tools

Once the bridge is running, these MCP tools are available:

| Tool | Description | Example |
|------|-------------|---------|
| `mcp__claude-in-chrome__tabs_context_mcp` | Get browser tabs | `{createIfEmpty: true}` |
| `mcp__claude-in-chrome__navigate` | Go to URL | `{url: "http://localhost:3000", tabId: "..."}` |
| `mcp__claude-in-chrome__computer` | Screenshot/click/type | `{action: "screenshot", tabId: "..."}` |
| `mcp__claude-in-chrome__get_page_text` | Extract page text | `{tabId: "..."}` |
| `mcp__claude-in-chrome__javascript_tool` | Run JavaScript | `{text: "document.title", tabId: "..."}` |
| `mcp__claude-in-chrome__find` | Find elements | `{query: "button", tabId: "..."}` |
| `mcp__claude-in-chrome__form_input` | Fill form fields | `{ref: "element-0", value: "test", tabId: "..."}` |

### E2E Test Workflow

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
