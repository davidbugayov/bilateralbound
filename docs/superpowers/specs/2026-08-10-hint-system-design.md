# Единая система подсказок (hint system) — дизайн

**Дата:** 2026-08-10
**Статус:** одобрено пользователем

## Проблема

На экране контроллера (`session-controller.html`) и viewer (`viewer.html`) существует
несколько разрозненных «подсказок» с разным дизайном и механиками:

1. **`links.tip`** («💡 Сохраните эти ссылки!») — перевод есть во всех 8 языках,
   но ключ **нигде не рендерится**. Мёртвая подсказка.
2. **Статус ожидания viewer** («waiting») — примитивный текст у поля ссылки,
   обновляется по WebSocket.
3. **Error-состояния** — `Session Expired` / `Connection Failed` рендерятся через
   `errorStateManager` (жёлто-оранжевые баннеры `.error-message`) или
   `EMDRErrorOverlay` (модал). Дизайн слабый, кнопка только «Reload page».
4. **Протухшая ссылка** (viewer, «Session not found») — `errorBar` внизу экрана
   с кнопкой «Retry», которая ничего не чинит: пользователь по тухлой ссылке
   не может создать новую сессию.
5. **Hotkeys** — на контроллере есть только во вкладке «Shortcuts» модалки настроек,
   на viewer — плашка внизу слева. На контроллере нет видимой подсказки.

На главном экране (`index.html`) уже есть переиспользуемые механики:
`hub-validation` (aria-live сообщения ✅/❌/💡), `hub-activation-inline__hint`
(💡 с `<code>/myid</code>`), `tip-box` в `shared-components.css`, `hub-manage__steps`.

## Цель

Единая система подсказок `bb-hint`: общий компонент (CSS + JS) с вариантами
`info / success / warning / error`, переиспользуемый на контроллере, viewer и
главном экране. Улучшить UI/UX существующих подсказок, активировать `links.tip`,
дать полезный CTA для протухших ссылок («Создать новую сессию»), добавить
hotkeys-подсказку на контроллер. Все новые тексты — во все 8 языков.

## Архитектура

### 1. Компонент `bb-hint`

**Файлы:**

- `public/css/shared-components.css` — стили `.bb-hint` (варианты, анимация, тёмная/светлая тема)
- `public/js/ui/hint-banner.js` — класс `HintBanner` (создание, показ, скрытие, localStorage-dismiss)

**API класса `HintBanner`:**

```js
// Создаёт баннер в контейнере
const banner = new HintBanner({
  container, // HTMLElement или id — куда вставить
  type, // 'info' | 'success' | 'warning' | 'error'
  title, // строка (опционально, i18n)
  message, // строка (HTML-совместимая, i18n)
  ctaLabel, // строка (опционально)
  onCta, // функция (опционально)
  dismissKey, // строка для localStorage (опционально) — если есть, баннер скрывается навсегда
  ariaLive, // 'polite' | 'assertive' (default 'polite')
});
banner.show();
banner.hide();
```

**Разметка:**

```html
<div class="bb-hint bb-hint--info" role="status" aria-live="polite">
  <span class="bb-hint__icon">💡</span>
  <div class="bb-hint__body">
    <div class="bb-hint__title">Заголовок</div>
    <div class="bb-hint__message">Текст</div>
  </div>
  <button class="bb-hint__cta">Создать новую сессию</button>
  <button class="bb-hint__close" aria-label="Close">×</button>
</div>
```

**Стили (дизайн в существующей теме):**

- Тёмная тема: фон `rgb(15 23 42 / 90%)`, border по варианту,
  левая акцентная полоска (4px) с градиентом, свечение как у `control-section`.
- Варианты (акценты, перекликаются с существующей палитрой):
  - `info` — синий `#3b82f6`
  - `success` — зелёный `#10b981`
  - `warning` — янтарный `#f59e0b`
  - `error` — красный `#ef4444`
- Анимация появления: `translateY(-6px) + opacity`, 0.25s ease-out.
- Светлая тема: `.light-theme` оверрайды (белый фон, серые border).
- `@media (max-width: 640px)` — компактнее, кнопка CTA на всю ширину.

### 2. Контроллер (`session-controller.html` + `src/controller.js` + `public/js/ui/`)

**2.1. Баннер `links.tip` (info)**

- Контейнер: под `link-group` в секции «Session».
- Текст: существующий ключ `links.tip` (HTML: `<strong>Сохраните эти ссылки!</strong> ...`).
- `dismissKey: 'bb_hint_links_tip_dismissed'` — после закрытия больше не показывается.
- Рендер: в `initializeComponents()` / отдельной функции `initHintSystem()`.

**2.2. Статус «waiting for viewer»**

- Превратить текст-статус у ссылки в пилюлю `.viewer-status-pill` с
  пульсирующей точкой (точка уже есть — `preview-dot` в превью; сделать
  аналогичную в пилюле). Цвет: `#f59e0b` (waiting) → `#22c55e` (connected).
- Затрагивает `updateViewerStatusUI` в `src/application/controller/viewer-status.js`.

**2.3. Error-баннер для `Session Expired` / `Connection Failed`**

- `showCriticalError` (в `src/controller.js`): добавить **CTA «Создать новую сессию»**
  (`window.location.href = '/'`) как первичное действие. Второстепенное — Reload.
- **Механика (однозначно):** `showCriticalError` рендерит через `HintBanner`
  (класс `bb-hint--error`, инжект в `#errorStatesContainer`, который уже есть в
  `session-controller.html`). Fallback — `errorStateManager`/`EMDRErrorOverlay`,
  если `HintBanner` не загружен. Существующий `errorStateManager` при этом
  остаётся для `showNotification` (info/warning тосты) без изменений.

**2.4. Hotkeys-подсказка**

- Компактная строка под заголовком секции Session (или под header):
  `Space — Start/Stop · F — Fullscreen · ↑↓←→ — Direction · Ctrl+S — Save preset`.
- Скрываемая (`dismissKey: 'bb_hotkeys_hint_dismissed'`), кнопка «×».
- Тексты из существующих ключей: `controller.hotkeySpaceKey/Action`,
  `hotkeyFKey/FAction`, `hotkeyArrowsAction`, `hotkeyCtrlSAction`.

### 3. Viewer (`viewer.html` + `src/viewer.js`)

**Протухшая ссылка («Session not found»):**

- В `DOMContentLoaded` catch в `src/viewer.js` (строка ~583): когда ошибка
  содержит «not found», показать вместо текстового `errorBar` баннер `bb-hint--error`
  с заголовком «Сессия не найдена», сообщением «Ссылка устарела или была удалена»
  и **CTA «Создать новую сессию»** (`href='/'`). Вторичное действие — Retry.
- Реализация: использовать `viewerErrorBar`/`errorBar` как fallback, основной
  путь — `HintBanner` в контейнере `#errorStatesContainer` (его нет в viewer.html —
  добавить div) или инжект в `body`.

### 4. Главный экран (`index.html`)

- Не менять существующие механики, но **стили `bb-hint` вынести в
  `shared-components.css`** (общие механики), чтобы при необходимости главная
  могла их использовать. Никаких функциональных изменений на главной.

### 5. i18n

Новые ключи (во все 8 языков: en, ru, es, fr, de, pt, ja, zh):

- `hint.sessionExpired` — заголовок «Сессия истекла»
- `hint.sessionExpiredMsg` — «Ваша сессия истекла или была удалена с сервера. Создайте новую сессию, чтобы продолжить.»
- `hint.sessionNotFound` — заголовок «Сессия не найдена»
- `hint.sessionNotFoundMsg` — «Ссылка устарела или была удалена. Создайте новую сессию.»
- `hint.createNewSession` — «Создать новую сессию»
- `hint.hotkeys` — заголовок «Горячие клавиши»
- `hint.close` — «Закрыть подсказку»
- (Переиспользуем существующие: `links.tip`, `controller.hotkey*`, `viewer.reload`.)

`links.tip` уже существует — просто активируем рендер.

## Обработка ошибок

- `HintBanner` не должен падать, если контейнер не найден — создаёт свой
  контейнер в `document.body` (как `errorStateManager.init`).
- localStorage может быть недоступен (private mode) — оборачивать в try/catch.
- `dismissKey` хранится как строка `'1'` / отсутствие.

## Тестирование

- Вручную (playwright): контроллер — баннер links.tip виден и закрывается
  навсегда; hotkeys-строка скрывается; ошибка Session Expired показывает CTA.
- Вручную: viewer с несуществующим sessionId показывает баннер «Сессия не найдена»
  с CTA «Создать новую сессию».
- `npm run lint`, `npm run build` (web-client), e2e-скрипты (`npm test`).

## Вне скоупа

- Изменение модалки настроек (вкладка Shortcuts остаётся как есть).
- Редизайн главного экрана.
- Серверная логика сессий.
