# Therapist Panel — Design

## Context

Compact control panel for EMDR therapists to use alongside a Zoom call.
Replaces `session-controller.html` as the primary therapist UI.
Route: `/panel/:sessionId` (old `/c/:id` remains untouched during transition).

## Package Structure

New Vite + React + TypeScript + Tailwind package: `packages/therapist-panel/`

```
packages/therapist-panel/
├── package.json
├── vite.config.ts        # base: '/panel/', outDir: ../../web-client/public/panel/
├── index.html
├── src/
│   ├── App.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   └── useStorage.ts
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Counters.tsx
│   │   ├── PlayButton.tsx
│   │   ├── SpeedSlider.tsx
│   │   ├── Settings.tsx
│   │   └── PreviewButton.tsx
│   └── preview/
│       ├── preview.html
│       └── preview.tsx
```

Build output goes to `packages/web-client/public/panel/`, served as static files by the existing Express server.

## Server Changes

Add one route to `packages/server-core/server/network/expressApp.js`:

```js
// SPA fallback for therapist panel
app.get('/panel/*', (req, res) => res.sendFile('panel/index.html', { root: publicDir }))
```

No other server changes.

## UI Layout

Width: 320–380px. Dark-mode friendly. Single vertical column.

```
Header:    Session ID + viewer connection status + copy link button
Counters:  Timer | Passes | Sets  (large digits)
PlayBtn:   Large Start/Stop button (green/red) + Reset below
Speed:     Slider (0.1–3.0) + audio toggle
Settings:  Collapsible — ball color, bg color, size (1–5)
Preview:   Button that opens popup window
```

## Data Flow

- `useWebSocket` connects as `role=controller` to existing WS server
- On speed/color/size change: `POST /api/session/:id/controller/update`
- On `state_update` received: update Timer, Passes, Sets display
- On play/pause: `POST /api/session/:id/controller/update` with `isPlaying`
- Preview popup: `window.open('/panel/preview?s=:id')` — receives ball position via `BroadcastChannel`

## Persistent Storage (localStorage)

| Key                  | Value           |
|----------------------|-----------------|
| bb_panel_speed       | float 0.1–3.0   |
| bb_panel_ballColor   | hex string      |
| bb_panel_bgColor     | hex string      |
| bb_panel_ballSize    | int 1–5         |
| bb_panel_session_log | JSON array      |

## Preview Popup

- Opens via `window.open('/panel/preview?s=:id', 'bb_preview', 'width=480,height=300')`
- Simple canvas with bouncing dot
- Receives `{ x, y, color, bgColor, size }` from main window via `BroadcastChannel('bb_preview')`
- Therapist can drag to second monitor or share via Zoom screen share

## Visual Style

- React + Tailwind CSS
- Dark mode by default (`bg-zinc-900`, `text-zinc-100`)
- PlayButton: `bg-green-600` when stopped, `bg-red-600` when playing
- Compact spacing: `p-3`, `gap-2`
- No animations in the panel UI itself

## Out of Scope

- No Claude API / AI features
- No changes to viewer.html or existing physics engine
- No TypeScript strict mode required (JS-like TS is fine)
- Timer logic already handled by server — panel only displays values from WS
