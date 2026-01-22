/* jshint boss: true, laxbreak: true, laxcomma: true, asi: true, unused: false */
/* global globalThis, console, module, process */

"use strict";
const { logger } = require('../logger.js');
// Интерфейс для управления WebSocket соединениями
class WebSocketManager {
  constructor(sessionRepository) {
    this.sessionRepository = sessionRepository;
    this.logger = logger;
  }

  addClient(sessionId, ws, role) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      return false;
    }
    session.clients.set(ws, {
      role,
      connectedAt: Date.now(),
      sessionId
    });
    // Обновляем статус подключения
    if (role === 'controller') {
      session.controllerConnected = true;
    } else if (role === 'viewer') {
      session.viewerConnected = true;
    }

    // Сбрасываем таймер частичного отключения если оба снова подключены
    if (session.controllerConnected && session.viewerConnected) {
      session.partialDisconnectTime = null;
      this.logger.logSession(sessionId, 'Both participants reconnected - timeout cleared');
    }

    this.logger.logSession(sessionId, `${role} connected via WebSocket`);
    return true;
  }

  removeClient(ws) {
    for (const session of this.sessionRepository.getAll()) {
      if (session.clients.has(ws)) {
        const clientInfo = session.clients.get(ws);
        session.clients.delete(ws);
        // Проверяем, остались ли клиенты этой роли
        this._updateConnectionStatus(session, clientInfo.role);
        this.logger.logSession(session.id, `${clientInfo.role} disconnected via WebSocket`);

        // Устанавливаем таймаут на отключение если осталась только одна роль
        if (!session.controllerConnected || !session.viewerConnected) {
          session.partialDisconnectTime = Date.now();
          this.logger.logSession(session.id, 'Partial disconnect detected - 15 min timeout started');
        }

        // Возвращаем ID сессии для дальнейшей обработки (например, для остановки физики)
        return session.id;
      }
    }

    return null;
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

    return Array.from(session.clients.entries()).map(([client, info]) => ({ client, info }));
  }
}

module.exports = WebSocketManager;
