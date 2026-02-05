# Coding Standards & Best Practices

## General Principles
- **Minimalism**: Write only used code. Remove dead code immediately.
- **Performance**: Optimize for low-latency real-time updates (critical for EMDR stimulation).
- **No Frameworks**: The client uses Vanilla JS. Do not introduce React/Vue/Angular unless explicitly requested for a rewrite.

## JavaScript
- **ES Modules**: Use `import`/`export` syntax.
- **Async/Await**: Prefer over Promises for cleanliness.
- **Error Handling**: Robust try/catch blocks, especially in network layers (SSE/WS).
- **Comments**: Comment complex logic (physics, sync algorithms), but avoid obvious comments.

## Naming Conventions
- **Files**: `kebab-case.js` (e.g., `sse-client.js`) for client files. `PascalCase.js` for Classes (e.g., `SessionManager.js`).
- **Variables**: `camelCase`.
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_SPEED`).

## Testing
- **E2E First**: Primary validation is via `scripts/e2e/master_e2e_test.js`.
- **Manual Verification**: Changes to visual stimulation often require manual check (`test-manual-bounce.js` context).

## Architecture Specifics
- **SSE vs WS**: When modifying network code, ensure compatibility with both transports or clearly distinguish paths.
- **State Management**: Server is the single source of truth. Clients are stateless renderers.
