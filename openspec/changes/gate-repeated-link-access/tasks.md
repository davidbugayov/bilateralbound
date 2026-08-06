# Tasks: Gate Repeated Link Access

## 1. Сервер: LinkAccessService

- [x] 1.1 Создать `packages/server-core/src/services/LinkAccessService.js`: in-memory `Map<browserId, Map<sessionId, {firstSeenAt, unlockedUntil}>>`, методы `get(browserId, sessionId)`, `markSeen(browserId, sessionId)`, `setUnlocked(browserId, sessionId, untilTs)`, `isUnlocked(browserId, sessionId, now)`.
- [x] 1.2 Персистенция по образцу `SubscriptionService`: `data/link-access.json`, загрузка при старте, сохранение при изменении, отбрасывание истёкших `unlockedUntil` и записей старше 30 дней при загрузке.
- [x] 1.3 Подключить `LinkAccessService` в `packages/server-core/src/index.js` (создание, передача в регистраторы роутов, `dataDir` из конфига).

## 2. Сервер: логика первого/повторного входа

- [x] 2.1 В `static_routes_controller.js` вынести общую логику gating для `/c/:sessionId` и `/s/:sessionId`: helper `decideAccess(req, sessionId)` возвращает `{ allow: true } | { allow: false }` по алгоритму из design.md (D2): несуществующая сессия → текущее поведение; `isCustomIdAllowed` → allow; нет cookie → выдать cookie + allow + markSeen; нет записи → markSeen + allow; иначе → deny.
- [x] 2.2 Применить helper в обоих роутах `/c/` и `/s/`: при `allow` — текущая отдача HTML; при `deny` — отдать paywall-страницу с HTTP-статусом 200 (или 402 — решить и зафиксировать) и no-cache заголовками.
- [x] 2.3 Установка cookie `bb_lk` (uuid, `SameSite=Lax`, `Secure` в проде, `Max-Age` 1 год) при первом входе — через `res.cookie`.

## 3. Сервер: эндпоинт разблокировки

- [x] 3.1 В `subscriptionController.js` (или новом роутере) добавить `POST /api/link-access/:sessionId/unlock`: валидация `telegramUserId` (число), проверка `subscriptionService.isActive`, получение `expiresAt` через `getStatus`, вызов `linkAccessService.setUnlocked(browserId, sessionId, expiresAt)`, ответ `{ success: true }`.
- [x] 3.2 Ошибки: 400 (невалидный ID), 402 (нет активной подписки, `i18nKey: 'paywall.invalidId'`); CSRF double-submit (не добавлять в whitelist).
- [x] 3.3 Если у запроса нет cookie `bb_lk` — выдать её и использовать созданное значение для разблокировки.

## 4. Клиент: paywall-страница

- [x] 4.1 Создать `packages/web-client/public/paywall.html` (по образцу `breathing.html`): заголовок, описание, кнопка на `https://t.me/emdrbilateral_bot`, форма ввода Telegram User ID, подсказка про `/myid`, все тексты через `data-i18n`.
- [x] 4.2 Добавить JS paywall (inline или `public/js/paywall.js`): извлечение sessionId из `location.pathname`, сабмит через `globalThis.csrfFetch('/api/link-access/' + sessionId + '/unlock', { method: 'POST', body: { telegramUserId } })`, при успехе `location.reload()`, при ошибке — показ сообщения.
- [x] 4.3 Подключить генерацию/отдачу `paywall.html` через `localizationService.getStaticLocalizedHtml('paywall.html', req)` + роут в `static_routes_controller.js` (или отдача статикой с no-cache).
- [x] 4.4 Проверить, что paywall-страница корректно грузит i18n IIFE и язык пользователя (по аналогии с `breathing.html`).

## 5. i18n

- [x] 5.1 Добавить ключи `paywall.*` (заголовок, описание, кнопка бота, подпись поля, placeholder, подсказка `/myid`, кнопка проверки, ошибки) в `packages/web-client/src/i18n/i18n.js` для всех 8 языков (ru, en, de, es, fr, pt, ja, zh).
- [x] 5.2 Запустить кодогенерацию IIFE (`node scripts/generate-i18n-iife.js`) и проверить `public/js/i18n/i18n.js`.
- [x] 5.3 Проверить фолбэк отсутствующих ключей (если механизм есть) — убедиться, что paywall не ломается при пропущенном переводе.

## 6. Сервис-воркер и интеграция

- [x] 6.1 Проверить `packages/web-client/public` service worker: исключить `/c/` и `/s/` из кэширования HTML (если кэширует), чтобы paywall/контент не смешивались.
- [x] 6.2 Убедиться, что `localizationService.getLocalizedHtml('viewer'|'controller', ...)` не меняется (gating выше по потоку).
- [x] 6.3 Проверить CSP/helmet: paywall.html не требует новых директив (внешние ссылки на t.me уже разрешены).

## 7. Тесты и валидация

- [ ] 7.1 Вручную на dev-стенде: первый вход по `/c/:id` (случайная сессия) → контент + cookie; повторный → paywall; ввод активного Telegram ID → контент; неактивного → ошибка.
- [ ] 7.2 Проверить владельца ссылки: активная подписка по customId → повторный вход без paywall; истёкшая → paywall.
- [ ] 7.3 Проверить `__test_`-режим (e2e-тесты не ломаются): `scripts/e2e/e2e_test.js`, `test-sync-params.js` на localhost.
- [ ] 7.4 Проверить, что несуществующая сессия не выдаёт cookie и не показывает paywall.
- [x] 7.5 `npm run lint` и `npm run build:dev` — без ошибок.
