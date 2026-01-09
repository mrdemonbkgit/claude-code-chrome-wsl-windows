# CLAUDE.md

## Chrome Bridge MCP Startup

Start the chrome-bridge MCP server before using browser automation tools:

```bash
# From WSL - runs PowerShell script on Windows
powershell.exe -ExecutionPolicy Bypass -File "$(wslpath -w /home/tony/projects/claude-code-chrome-wsl-windows/windows-host/start-all.ps1)"
```

This starts both Chrome (with debugging on port 9222) and the Windows host (WebSocket on port 19222).

To stop:
```bash
powershell.exe -ExecutionPolicy Bypass -File "$(wslpath -w /home/tony/projects/claude-code-chrome-wsl-windows/windows-host/stop-all.ps1)"
```

## Code Review with Codex CLI

Use `codex` CLI for code and planning review as a second opinion:

```bash
codex -m gpt-5.2-codex --reasoning high "review this code/plan: <context>"
```

**Always verify Codex findings independently** - treat as suggestions, not authoritative answers.
