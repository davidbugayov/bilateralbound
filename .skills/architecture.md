# System Architecture

## Overview

Distributed EMDR therapy platform designed for real-time bilateral stimulation synchronization between a Therapist (Controller) and a Client (Viewer).

## Core Components

### 1. Server Core (`@emdr/server-core`)

- Acts as the central state of truth.
- Manages Sessions (`SessionManager.js`).
- Broadcasts state updates via **SSE** (preferred) or **WebSocket** (legacy).
- `StateBroadcaster.js` abstracts the transport layer.
- **Key Flow**: Controller Updates State -> Server Validates -> Server Broadcasts to all Session Participants.

### 2. Web Client (`@emdr/web-client`)

- **Controller (`session-controller.html`)**:
  - Admin interface for the therapist.
  - Sends commands via REST API or WebSocket.
  - Controls: Speed, Color, Duration, Sound, Mode.
- **Viewer (`viewer.html`)**:
  - Passive client interface for the patient.
  - Receives state updates via SSE/WS.
  - Renders visual (canvas/DOM) and audio stimulation.
  - **Critical Requirement**: Low latency synchronization.

## Data Flow

1. **State Update**: Therapist changes settings (e.g., speed) on Controller.
2. **Transmission**: Command sent to Server.
3. **Processing**: Server updates session state in memory.
4. **Broadcasting**: `StateBroadcaster` pushes JSON patch/state to connected clients (SSE).
5. **Rendering**: Clients apply state to `PhysicsEngine` or `Renderer`.
6. **Sync**: Periodic sync checks ensure drift is minimized.

## Directories

- `packages/server-core/server/session/`: Core logic for session state.
- `packages/web-client/public/js/core/`: Core client logic (if exists) or root `js/`.
- `scripts/`: Deployment and testing automation.
