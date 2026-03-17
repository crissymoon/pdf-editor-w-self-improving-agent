# Double Agent Architecture

Structure:

- agent-main
- agent-dbl
  - tools
  - reports

Both agents use an MCP-style tool contract with streamed narration events.

## Runtime Behavior

- Agent tool calls use the same editor command runner.
- Agent narration events stream start, progress, complete, and error phases.
- Tooling gaps and runtime failures are stored as report entries in localStorage.

## Browser API

At runtime, the editor exposes a global API:

- `window.xcmPdfAgents.listTools('main' | 'dbl')`
- `window.xcmPdfAgents.callTool('main' | 'dbl', { name, arguments })`
- `window.xcmPdfAgents.getReports('main' | 'dbl')`

Example calls:

- `window.xcmPdfAgents.callTool('main', { name: 'editor.open_file_picker' })`
- `window.xcmPdfAgents.callTool('dbl', { name: 'editor.set_tool', arguments: { tool: 'checkbox' } })`
- `window.xcmPdfAgents.callTool('dbl', { name: 'editor.canvas_click', arguments: { x: 120, y: 240 } })`

## Promotion Flow

Use the promotion script to copy dbl over main:

- npm run agent:promote

This replaces src/agent/agent-main with src/agent/agent-dbl.
