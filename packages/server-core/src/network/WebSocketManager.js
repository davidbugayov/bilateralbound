'use strict';
// Интерфейс для управления WebSocket соединениями
class WebSocketManager {
  constructor(sessionRepository, logger) {
    this.sessionRepository = sessionRepository;
    this.logger = logger;
    this._wsIndex = new Map(); // reverse map: ws → {sessionId, role}
  }

  addClient(sessionId, ws, role) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      return false;
    }
    session.clients.set(ws, {
      role,
      connectedAt: Date.now(),
      sessionId,
    });
    this._wsIndex.set(ws, { sessionId, role });
    // Обновляем статус подключения
    if (role === 'controller') {
      session.controllerConnected = true;
    } else if (role === 'viewer') {
      session.viewerConnected = true;
    }

    // Сбрасываем таймер частичного отключения если оба снова подключены
    if (session.controllerConnected && session.viewerConnected) {
      session.partialDisconnectTime = null;
      this.logger.logSession(
        sessionId,
        'Both participants reconnected - timeout cleared',
      );
    }

    this.logger.logSession(sessionId, `${role} connected via WebSocket`);
    return true;
  }

  removeClient(ws) {
    const entry = this._wsIndex.get(ws); // O(1)
    if (!entry) return null;

    this._wsIndex.delete(ws);
    const { sessionId, role } = entry;
    const session = this.sessionRepository.findById(sessionId);
    if (!session) return sessionId;

    session.clients.delete(ws);
    this._updateConnectionStatus(session, role);
    this.logger.logSession(sessionId, `${role} disconnected via WebSocket`);

    if (!session.controllerConnected || !session.viewerConnected) {
      session.partialDisconnectTime = Date.now();
      this.logger.logSession(
        sessionId,
        'Partial disconnect detected - 15 min timeout started',
      );
    }

    return sessionId;
  }

  /**
   * Returns {sessionId, role} for a WS connection in O(1).
   * @param {WebSocket} ws
   * @returns {{sessionId: string, role: string}|null}
   */
  getClientInfo(ws) {
    return this._wsIndex.get(ws) || null;
  }

  _updateConnectionStatus(session, disconnectedRole) {
    let hasController = false;
    let hasViewer = false;
    for (const [, info] of session.clients) {
      if (info.role === 'controller') {
        hasController = true;
      }
      if (info.role === 'viewer') {
        hasViewer = true;
      }
    }

    if (disconnectedRole === 'controller') {
      session.controllerConnected = hasController;
    } else if (disconnectedRole === 'viewer') {
      session.viewerConnected = hasViewer;
    }
  }

  getClients(sessionId, role = null) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      return [];
    }

    if (role) {
      return Array.from(session.clients.entries())
        .filter(([, info]) => info.role === role)
        .map(([client, info]) => ({ client, info }));
    }

    return Array.from(session.clients.entries()).map(([client, info]) => ({
      client,
      info,
    }));
  }

  /**
   * Check if a session has at least one client of the given role.
   * More efficient than getClients().some() — no array allocation.
   * @param {string} sessionId
   * @param {string} role
   * @returns {boolean}
   */
  hasRole(sessionId, role) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) return false;
    for (const [, info] of session.clients) {
      if (info.role === role) return true;
    }
    return false;
  }
}

module.exports = WebSocketManager;
