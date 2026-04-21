# KILOCODE.md

## Project Context

EMDR BilateralBound — web platform for EMDR therapy. Therapist controller manages bilateral ball movement, patient viewer observes in real time via WebSocket.

Source baseline:
- [`CLAUDE.md`](CLAUDE.md)
- [`.clinerules`](.clinerules)
- [`../../.cline/data/settings/cline_mcp_settings.json`](../../.cline/data/settings/cline_mcp_settings.json)
- [`../../.agents/skills/tdd-workflow/SKILL.md`](../../.agents/skills/tdd-workflow/SKILL.md)
- [`../../.agents/skills/backend-patterns/SKILL.md`](../../.agents/skills/backend-patterns/SKILL.md)

Conflict priority:
1. [`CLAUDE.md`](CLAUDE.md)
2. [`.clinerules`](.clinerules)
3. Local clarifications in this file

## Language & Style

- Respond in the language of the user. For this project, Russian is preferred in user communication.
- Code comments must be in English.
- User-facing UI strings must go through i18n.
- Never hardcode localized strings directly in UI.

## Hard Rules

1. Write only used code. No unused functions, imports, variables, or dead paths.
2. No over-engineering. Implement only explicitly required behavior.
3. Comment why, not what, especially around sync, physics, and WebSocket edge cases.
4. Do not create markdown reports unless explicitly requested.
5. Keep commits short and precise.

## Architecture Guardrails

- Monorepo workspace: server, web client, and shared logic.
- Real-time transport is WebSocket.
- Keep deterministic sync behavior between controller and viewer.
- Never introduce per-frame position correction that causes jitter.
- Prefer event-based correction on fresh server events.
- Keep client and server physics assumptions aligned when touching movement/sync logic.

## Conventions

- i18n usage pattern: `globalThis.i18n?.t('key') || 'English fallback'`.
- Module export pattern in browser scripts uses guarded global assignment to avoid double-load.
- Preserve global session-state conventions already used by the project.
- Respect current WebSocket endpoint role/sessionId model.

## Sensitive Files

Do not modify without explicit instruction:
- Shared physics engine files
- WebSocket routing and transport-critical files
- Broadcast/sync services
- Viewer runtime logic
- Reconnect-critical WebSocket client code

## MCP Servers From Cline

Reference source: [`../../.cline/data/settings/cline_mcp_settings.json`](../../.cline/data/settings/cline_mcp_settings.json)

### `ruflo`

- enabled: `disabled: false`
- timeout: `60`
- transport: `type: stdio`
- command: `npx`
- args: `ruflo@latest mcp start`
- env: `{}`
- policy: large `autoApprove` allowlist is configured in source and should be imported as-is unless security policy requires narrowing.

### `context7`

- server is present in source config and should be migrated with its server fields (`disabled`, `timeout`, `type`, `command`, `args`, `env`, `autoApprove`) from the same file.

## Skills Activation

### `tdd-workflow`

Source: [`../../.agents/skills/tdd-workflow/SKILL.md`](../../.agents/skills/tdd-workflow/SKILL.md)

Activate when:
- New feature development
- Bug fixing
- Refactoring
- New API endpoints/components

Mandatory workflow:
1. RED: add/execute tests first, validate failing reason is relevant.
2. GREEN: implement minimal fix, rerun relevant tests.
3. REFACTOR: improve code while keeping tests green.
4. Verify coverage target and critical edge/error/boundary cases.

### `backend-patterns`

Source: [`../../.agents/skills/backend-patterns/SKILL.md`](../../.agents/skills/backend-patterns/SKILL.md)

Activate when:
- Designing API endpoints
- Changing repository/service/controller layers
- Optimizing DB/query behavior
- Building middleware, caching, transactions, backend reliability behavior

Core expectations:
- Clear REST semantics
- Separation of concerns between controller/service/repository
- Safe validation and error handling
- Query optimization and N+1 prevention
- Practical caching and transaction patterns where relevant

## Validation Checklist

- All key rule blocks from [`CLAUDE.md`](CLAUDE.md) are represented.
- Project-specific constraints from [`.clinerules`](.clinerules) are represented where not conflicting.
- Conflict resolution follows declared priority with [`CLAUDE.md`](CLAUDE.md) winning.
- MCP section references the actual Cline source config.
- Skills section captures activation criteria and operational requirements, not unrelated boilerplate examples.
