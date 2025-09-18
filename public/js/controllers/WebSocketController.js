// WebSocketController — прокладка над WebSocketClient с подписками
export class WebSocketController {
  constructor (wsClient) {
    this.wsClient = wsClient
  }

  onInitialState (cb) {
    this.wsClient?.on?.(window.WS_MSG?.initialState || 'initial_state', cb)
  }

  onStateUpdate (cb) {
    this.wsClient?.on?.(window.WS_MSG?.stateUpdate || 'state_update', cb)
  }

  onViewerStatus (cb) {
    this.wsClient?.on?.(window.WS_MSG?.viewerStatus || 'viewer_status', cb)
  }
}


