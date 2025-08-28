// Simple Session Manager - only stores session metadata
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./logger');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.config = config.getServerConfig();
    this.lastPhysicsUpdate = new Map(); // Для throttling обновлений физики
  }

  // Set viewer screen size
  setViewerScreenSize(sessionId, width, height) {
    const session = this.getSession(sessionId);
    if (session) {
      const newSize = { width: parseInt(width), height: parseInt(height) };
      const oldSize = session.viewerScreenSize;

      session.viewerScreenSize = newSize;
      session.lastActivity = Date.now();

      // Если размеры экрана изменились и мяч находится в центре (по умолчанию),
      // пересчитаем его позицию относительно новых размеров
      if (oldSize &&
          (oldSize.width !== newSize.width || oldSize.height !== newSize.height) &&
          session.ballState.x === 400 && session.ballState.y === 300) {

        // Пересчитываем позицию мяча относительно центра нового экрана
        session.ballState.x = Math.round(newSize.width / 2);
        session.ballState.y = Math.round(newSize.height / 2);
        session.ballState.radius = Math.min(40, Math.round(Math.min(newSize.width, newSize.height) / 20));

        logger.logSession(sessionId, `Viewer screen size updated: ${newSize.width}x${newSize.height}, ball repositioned`);
      }
    }
  }

  // Get viewer screen size
  getViewerScreenSize(sessionId) {
    const session = this.getSession(sessionId);
    return session ? session.viewerScreenSize : null;
  }

  // Create new session
  createSession() {
    if (this.sessions.size >= this.config.MAX_SESSIONS) {
      throw new Error('Maximum sessions limit reached');
    }

    const sessionId = uuidv4().slice(0, 6);

    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      controllerConnected: false,
      viewerConnected: false,
      // Состояние шарика
      ballState: {
        x: 400,           // позиция X (будет обновлена при подключении вьювера)
        y: 300,           // позиция Y (будет обновлена при подключении вьювера)
        vx: 0,            // скорость X
        vy: 0,            // скорость Y
        speed: 40,        // скорость движения (40% = 256 px/s)
        radius: 40,       // размер шарика
        colorBall: '#60a5fa', // цвет шарика
        colorBg: '#020617',    // цвет фона
        paused: true      // состояние паузы
      }
    };

    this.sessions.set(sessionId, session);
    logger.logSession(sessionId, 'Session created');
    return session;
  }

  // Get session by ID
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  // Set controller connection status
  setControllerConnected(sessionId, connected = true) {
    const session = this.getSession(sessionId);
    if (session) {
      session.controllerConnected = connected;
      session.lastActivity = Date.now();
      logger.logSession(sessionId, `Controller ${connected ? 'connected' : 'disconnected'}`);
    }
  }

  // Set viewer connection status
  setViewerConnected(sessionId, connected = true) {
    const session = this.getSession(sessionId);
    if (session) {
      session.viewerConnected = connected;
      if (connected) {
        session.lastActivity = Date.now();
        logger.logSession(sessionId, 'Viewer connected');
      }
    }
  }

  // Update session activity
  // Clean up expired sessions
  cleanupExpiredSessions() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const tenMinutes = 10 * 60 * 1000;
    const fiveMinutes = 5 * 60 * 1000;

    let cleanedCount = 0;
    let expiredCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      // Clean up very old sessions (1 hour max)
      if (session.createdAt && (now - session.createdAt) > oneHour) {
        this.sessions.delete(sessionId);
        expiredCount++;
        logger.logSession(sessionId, 'Session expired (1 hour)');
        continue;
      }

      // Clean up sessions without viewers quickly (5 minutes)
      if (session.controllerConnected && !session.viewerConnected &&
          session.createdAt && (now - session.createdAt) > fiveMinutes) {
        this.sessions.delete(sessionId);
        cleanedCount++;
        logger.logSession(sessionId, 'Session cleaned (no viewer)');
        continue;
      }

      // Clean up inactive sessions (10 minutes without activity)
      if (!this.hasActiveUsers(sessionId) &&
          session.lastActivity && (now - session.lastActivity) > tenMinutes) {
        this.sessions.delete(sessionId);
        cleanedCount++;
        logger.logSession(sessionId, 'Session cleaned (inactive)');
      }
    }

    if (cleanedCount > 0 || expiredCount > 0) {
      logger.info(`Session cleanup completed: ${cleanedCount} cleaned, ${expiredCount} expired`);
    }
  }

  // Check if session has active users
  hasActiveUsers(sessionId) {
    const session = this.getSession(sessionId);
    return session && (session.controllerConnected || session.viewerConnected);
  }

  // Get all active sessions
  getActiveSessions() {
    return Array.from(this.sessions.values());
  }

  // Get session count
  getSessionCount() {
    return this.sessions.size;
  }

  // Update ball state
  updateBallState(sessionId, updates) {
    const session = this.getSession(sessionId);
    if (!session) return false;

    // Сначала обновляем speedScalar, чтобы он был актуальным для расчетов скорости
    if (updates.speedScalar !== undefined) {
      session.ballState.speed = updates.speedScalar;
      // Обновляем текущую скорость движения
      if (session.ballState.vx !== 0 || session.ballState.vy !== 0) {
        const currentSpeed = Math.sqrt(session.ballState.vx ** 2 + session.ballState.vy ** 2);
        const scale = session.ballState.speed / currentSpeed;
        session.ballState.vx *= scale;
        session.ballState.vy *= scale;
      }
    }

    // Нормализуем направление: разрешаем только горизонталь, вертикаль и диагонали
    // Обрабатываем направление независимо от resume - направление может меняться при работающем мяче
    if (updates.dirX !== undefined || updates.dirY !== undefined) {
      const rawX = typeof updates.dirX === 'number' ? updates.dirX : 0;
      const rawY = typeof updates.dirY === 'number' ? updates.dirY : 0;
      let nx = 0, ny = 0;
      if (rawX === 0 && rawY === 0) {
        nx = 0; ny = 0;
      } else {
        // Приводим к знакам -1/0/1
        const sx = rawX === 0 ? 0 : (rawX > 0 ? 1 : -1);
        const sy = rawY === 0 ? 0 : (rawY > 0 ? 1 : -1);
        // Разрешенные пары: (±1,0), (0,±1), (±1,±1)
        if ((sx !== 0 && sy === 0) || (sx === 0 && sy !== 0) || (sx !== 0 && sy !== 0)) {
          nx = sx; ny = sy;
        }
      }

      // Проверяем, соответствует ли текущая скорость направлению
      const currentVxSign = session.ballState.vx === 0 ? 0 : (session.ballState.vx > 0 ? 1 : -1);
      const currentVySign = session.ballState.vy === 0 ? 0 : (session.ballState.vy > 0 ? 1 : -1);
      const speedMatchesDirection = (currentVxSign === nx || nx === 0) && (currentVySign === ny || ny === 0);

      // Рассчитываем скорость в пикселях в секунду
      // 100% = 640 px/s, 40% = 256 px/s
      const pixelsPerSecond = Math.max((session.ballState.speed / 100) * 640, 250); // Минимум 250 px/s
      const currentSpeed = Math.sqrt(session.ballState.vx ** 2 + session.ballState.vy ** 2);

      // Обновляем скорость только если:
      // 1. Скорость не соответствует направлению, ИЛИ
      // 2. Текущая скорость меньше минимальной, ИЛИ
      // 3. Это новая команда (скорость была нулевой)
      // НО: не перезаписываем скорость, если она была изменена отскоком
      const speedWasChangedByBounce = (nx > 0 && session.ballState.vx < 0) || (nx < 0 && session.ballState.vx > 0) ||
                                       (ny > 0 && session.ballState.vy < 0) || (ny < 0 && session.ballState.vy > 0);

      // logger.logSession(sessionId, `DEBUG: nx=${nx}, ny=${ny}, currentVx=${session.ballState.vx}, currentVy=${session.ballState.vy}, speedMatches=${speedMatchesDirection}, bounceDetected=${speedWasChangedByBounce}`);

      if (!speedMatchesDirection || currentSpeed < pixelsPerSecond * 0.8 || currentSpeed < 200) {
        // Если скорость была изменена отскоком, сохраняем её
        if (speedWasChangedByBounce && currentSpeed >= pixelsPerSecond * 0.9) {
          // Не меняем скорость - она уже правильная после отскока
          logger.logSession(sessionId, `🎯 BOUNCE PRESERVED: vx=${session.ballState.vx}, vy=${session.ballState.vy} (command was ${nx}, ${ny})`);
        } else {
          // Устанавливаем новую скорость
          session.ballState.vx = nx * pixelsPerSecond;
          session.ballState.vy = ny * pixelsPerSecond;

          // Защита от нулевой скорости - если скорость стала нулевой, устанавливаем минимальную
          const newSpeed = Math.sqrt(session.ballState.vx ** 2 + session.ballState.vy ** 2);
          if (newSpeed < 200 && (nx !== 0 || ny !== 0)) {
              // Восстанавливаем минимальную скорость
              const minSpeed = 250; // Минимум 250 px/s (синхронизировано с клиентом)
              const scale = minSpeed / newSpeed;
              session.ballState.vx *= scale;
              session.ballState.vy *= scale;
              logger.logSession(sessionId, `Speed restored from ${newSpeed.toFixed(1)} to ${minSpeed} px/s`);
          }

          logger.logSession(sessionId, `Direction updated: (${nx}, ${ny}), speed: ${pixelsPerSecond}px/s, vx: ${session.ballState.vx}, vy: ${session.ballState.vy}`);
        }
      } else {
        logger.logSession(sessionId, `Direction command ignored - speed already matches direction: vx=${session.ballState.vx}, vy=${session.ballState.vy}`);
      }
    }

    // Сервер больше не обновляет физику мяча
    // Физика работает на клиентах, сервер только управляет состоянием
    if (updates.colorBall !== undefined) session.ballState.colorBall = updates.colorBall;
    if (updates.colorBg !== undefined) session.ballState.colorBg = updates.colorBg;
    if (updates.radius !== undefined) session.ballState.radius = updates.radius;
    if (updates.resume !== undefined) {
      session.ballState.paused = false;
      // При resume нужно установить направление, если оно указано в команде
      if (updates.dirX !== undefined || updates.dirY !== undefined) {
        // Если указано направление, используем его для расчета скорости
        const rawX = typeof updates.dirX === 'number' ? updates.dirX : 0;
        const rawY = typeof updates.dirY === 'number' ? updates.dirY : 0;
        let nx = 0, ny = 0;
        if (rawX === 0 && rawY === 0) {
          nx = 0; ny = 0;
        } else {
          const sx = rawX === 0 ? 0 : (rawX > 0 ? 1 : -1);
          const sy = rawY === 0 ? 0 : (rawY > 0 ? 1 : -1);
          if ((sx !== 0 && sy === 0) || (sx === 0 && sy !== 0) || (sx !== 0 && sy !== 0)) {
            nx = sx; ny = sy;
          }
        }

        const pixelsPerSecond = Math.max((session.ballState.speed / 100) * 640, 250); // Минимум 250 px/s

        // НЕ сбрасываем позицию! Только устанавливаем скорость в нужном направлении
        // Мяч должен продолжать движение из текущей позиции
        session.ballState.vx = nx * pixelsPerSecond;
        session.ballState.vy = ny * pixelsPerSecond;

        logger.logSession(sessionId, `Ball direction changed: position=(${session.ballState.x}, ${session.ballState.y}), new_velocity=(${session.ballState.vx}, ${session.ballState.vy})`);
      } else if (session.ballState.vx !== 0 || session.ballState.vy !== 0) {
        // Если уже есть скорость, пересчитываем ее на основе новой скорости
        const currentSpeed = Math.sqrt(session.ballState.vx ** 2 + session.ballState.vy ** 2);
        if (currentSpeed > 0) {
          const scale = session.ballState.speed / currentSpeed;
          session.ballState.vx *= scale;
          session.ballState.vy *= scale;
        }
      } else {
        // Если скорости нет, но направление указано - устанавливаем только скорость, оставляем позицию
        const pixelsPerSecond = Math.max((session.ballState.speed / 100) * 640, 250); // Минимум 250 px/s

        // Устанавливаем скорость в указанном направлении, но не меняем позицию
        session.ballState.vx = nx * pixelsPerSecond;
        session.ballState.vy = ny * pixelsPerSecond;

        logger.logSession(sessionId, `Ball started: position=(${session.ballState.x}, ${session.ballState.y}), velocity=(${session.ballState.vx}, ${session.ballState.vy})`);
      }
    }
    if (updates.pause !== undefined) session.ballState.paused = true;
    if (updates.reset !== undefined) {
      // Используем размеры экрана вьювера для центрирования
      const viewerScreenSize = session.viewerScreenSize || { width: 800, height: 600 };
      session.ballState.x = Math.floor(viewerScreenSize.width / 2);
      session.ballState.y = Math.floor(viewerScreenSize.height / 2);
      session.ballState.vx = 0;
      session.ballState.vy = 0;
      session.ballState.paused = true;
    }

    session.lastActivity = Date.now();
    return true;
  }

  // Update ball physics with viewer screen boundaries (оптимизированная версия)


  // Get ball state for viewer
  getBallState(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return session.ballState;
  }
}

module.exports = new SessionManager();