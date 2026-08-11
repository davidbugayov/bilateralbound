# Единая система подсказок bb-hint — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Единый переиспользуемый компонент подсказок `bb-hint` (CSS + JS), активировать `links.tip` на контроллере, улучшить статус «waiting for viewer», добавить hotkeys-подсказку на контроллер, дать CTA «Создать новую сессию» для протухших ссылок (Session Expired / Session not found) на контроллере и viewer. Все новые тексты — во все 8 языков.

**Architecture:** Глобальный класс `HintBanner` (`public/js/ui/hint-banner.js`, без модулей — грузится script-тегом до бандлов) + стили `.bb-hint` в `shared-components.css` (подключён и на контроллере, и на viewer). Контроллер и viewer используют его для tip/hotkeys/error-состояний; `errorStateManager`/`EMDRErrorOverlay` остаются как fallback. Статус viewer стилизуется через CSS без изменения разметки (e2e не ломается).

**Tech Stack:** Vanilla JS (ES2018, `?.` уже используется в src/), CSS (минифицированные файлы — новые правила ДОБАВЛЯЕМ в конец файла), i18n JSON (8 языков), webpack.

## Global Constraints

- CSS-файлы в `public/css/*.css` минифицированы в одну строку — новые правила **только append в конец файла** (через `cat >> file`), не редактировать середину.
- Новый JS в `public/js/ui/` — plain browser-global IIFE (`globalThis.HintBanner`), НЕ ES-модуль (public/js грузится script-тегами, не webpack).
- i18n ключи добавлять во **все 8 файлов**: `public/locales/{en,ru,es,fr,de,pt,ja,zh}/common.json`.
- Не ломать e2e: элемент `#viewerStatus` должен остаться с тем же `id` и тем же текстом.
- `session-controller.html` и `viewer.html` содержат версионные query-параметры (`?v=2.39.794-...`) — при добавлении script/css подключать с тем же суффиксом версии, что у соседних ресурсов.

---

### Task 1: Компонент `HintBanner` (JS) + стили `.bb-hint` (CSS)

**Files:**
- Create: `packages/web-client/public/js/ui/hint-banner.js`
- Modify: `packages/web-client/public/css/shared-components.css` (append)

**Interfaces:**
- Produces: `globalThis.HintBanner` — конструктор `new HintBanner(config)`, методы `show()` (возвращает элемент или `undefined` при dismiss), `hide()`.
  `config = { container, type ('info'|'success'|'warning'|'error'), title, message (innerHTML), icon, ctaLabel, onCta, dismissKey, closeLabel, ariaLive }`.

- [ ] **Step 1: Создать `public/js/ui/hint-banner.js`**

```js
/* jshint esversion: 6 */
/**
 * HintBanner — единая система подсказок (bb-hint)
 * Используется на контроллере, viewer и главном экране.
 */
(function () {
  'use strict'

  var ICONS = { info: '💡', success: '✅', warning: '⚠️', error: '🚫' }
  var TYPES = ['info', 'success', 'warning', 'error']

  function storageGet(key) {
    try { return window.localStorage.getItem(key) } catch (e) { return null }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value) } catch (e) { /* noop */ }
  }

  function HintBanner(config) {
    this.config = config || {}
    this.el = null
  }

  HintBanner.prototype.show = function () {
    var cfg = this.config
    if (cfg.dismissKey && storageGet(cfg.dismissKey)) return undefined
    if (this.el) return this.el

    var type = TYPES.indexOf(cfg.type) !== -1 ? cfg.type : 'info'

    var el = document.createElement('div')
    el.className = 'bb-hint bb-hint--' + type
    el.setAttribute('role', cfg.ariaLive === 'assertive' ? 'alert' : 'status')
    el.setAttribute('aria-live', cfg.ariaLive || 'polite')

    var icon = document.createElement('span')
    icon.className = 'bb-hint__icon'
    icon.textContent = cfg.icon || ICONS[type]
    el.appendChild(icon)

    var body = document.createElement('div')
    body.className = 'bb-hint__body'
    if (cfg.title) {
      var title = document.createElement('div')
      title.className = 'bb-hint__title'
      title.textContent = cfg.title
      body.appendChild(title)
    }
    if (cfg.message) {
      var msg = document.createElement('div')
      msg.className = 'bb-hint__message'
      msg.innerHTML = cfg.message
      body.appendChild(msg)
    }
    el.appendChild(body)

    if (cfg.ctaLabel && typeof cfg.onCta === 'function') {
      var cta = document.createElement('button')
      cta.type = 'button'
      cta.className = 'bb-hint__cta'
      cta.textContent = cfg.ctaLabel
      cta.addEventListener('click', function () { cfg.onCta() })
      el.appendChild(cta)
    }

    var self = this
    var closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'bb-hint__close'
    closeBtn.setAttribute('aria-label', cfg.closeLabel || 'Close')
    closeBtn.innerHTML = '&times;'
    closeBtn.addEventListener('click', function () {
      if (cfg.dismissKey) storageSet(cfg.dismissKey, '1')
      self.hide()
    })
    el.appendChild(closeBtn)

    var container = cfg.container
    if (typeof container === 'string') container = document.getElementById(container)
    if (!container || container.nodeType !== 1) {
      container = document.createElement('div')
      container.className = 'bb-hint-container'
      document.body.appendChild(container)
    }
    container.appendChild(el)
    this.el = el
    return el
  }

  HintBanner.prototype.hide = function () {
    if (!this.el || !this.el.parentNode) return
    var el = this.el
    this.el = null
    el.classList.add('bb-hint--leaving')
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el)
    }, 200)
  }

  if (typeof globalThis !== 'undefined') globalThis.HintBanner = HintBanner
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HintBanner: HintBanner }
  }
})()
```

- [ ] **Step 2: Проверить синтаксис**

Run: `node --check packages/web-client/public/js/ui/hint-banner.js`
Expected: exit 0, без вывода.

- [ ] **Step 3: Добавить стили `.bb-hint` в конец `shared-components.css`**

Run (append, т.к. файл минифицирован в одну строку):

```bash
cat >> packages/web-client/public/css/shared-components.css << 'EOF'
.bb-hint{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:12px;background:linear-gradient(145deg,rgb(30 41 59/.95) 0,rgb(15 23 42/.95) 100%);border:1px solid rgb(51 65 85/.8);border-left:4px solid #3b82f6;box-shadow:0 4px 16px -2px rgb(0 0 0/.3),inset 0 1px 0 rgb(255 255 255/.05);margin:12px 0;opacity:0;transform:translateY(-6px);animation:bbHintIn .25s ease-out forwards}
@keyframes bbHintIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.bb-hint--leaving{opacity:0;transform:translateY(-6px);transition:opacity .2s ease-out,transform .2s ease-out}
.bb-hint--success{border-left-color:#10b981}
.bb-hint--warning{border-left-color:#f59e0b}
.bb-hint--error{border-left-color:#ef4444}
.bb-hint__icon{flex-shrink:0;font-size:18px;line-height:1.4}
.bb-hint__body{flex:1;min-width:0}
.bb-hint__title{font-weight:700;font-size:.9rem;color:#e2e8f0;margin-bottom:2px}
.bb-hint__message{font-size:.85rem;line-height:1.55;color:#94a3b8}
.bb-hint__message strong{color:#e2e8f0}
.bb-hint__message kbd{display:inline-block;padding:1px 6px;background:rgb(34 211 238/.1);border:1px solid rgb(34 211 238/.25);border-radius:4px;font-family:ui-monospace,monospace;font-size:11px;color:#22d3ee;margin:0 2px;box-shadow:0 1px 3px rgb(0 0 0/.3)}
.bb-hint__cta{flex-shrink:0;align-self:center;padding:8px 16px;border-radius:8px;border:0;background:linear-gradient(135deg,#3b82f6 0,#2563eb 100%);color:#fff;font-size:.85rem;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgb(59 130 246/.3);transition:background .2s ease,transform .2s ease}
.bb-hint__cta:hover{background:linear-gradient(135deg,#2563eb 0,#1d4ed8 100%);transform:translateY(-1px)}
.bb-hint--error .bb-hint__cta{background:linear-gradient(135deg,#ef4444 0,#dc2626 100%);box-shadow:0 2px 8px rgb(239 68 68/.3)}
.bb-hint--error .bb-hint__cta:hover{background:linear-gradient(135deg,#dc2626 0,#b91c1c 100%)}
.bb-hint__close{flex-shrink:0;align-self:flex-start;width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:0 0;border:0;border-radius:6px;color:#64748b;font-size:18px;cursor:pointer;line-height:1;padding:0;transition:color .2s ease,background .2s ease}
.bb-hint__close:hover{color:#e2e8f0;background:rgb(51 65 85/.6)}
.bb-hint-container{display:block;width:100%;max-width:1000px;margin:0 auto;padding:0 20px;box-sizing:border-box;position:relative;z-index:50}
.light-theme .bb-hint{background:linear-gradient(145deg,#fff 0,#f8fafc 100%);border-color:rgb(148 163 184/.4);box-shadow:0 4px 16px -2px rgb(0 0 0/.08)}
.light-theme .bb-hint__title{color:#1e293b}
.light-theme .bb-hint__message{color:#64748b}
.light-theme .bb-hint__message strong{color:#1e293b}
.light-theme .bb-hint__message kbd{background:rgb(226 232 240/.8);border-color:rgb(148 163 184/.4);color:#334155}
.light-theme .bb-hint__close{color:#94a3b8}
.light-theme .bb-hint__close:hover{color:#1e293b;background:rgb(226 232 240/.7)}
@media (max-width:640px){.bb-hint{flex-wrap:wrap;padding:12px 14px;gap:8px}.bb-hint__cta{width:100%}.bb-hint__close{align-self:center}}
EOF
```

- [ ] **Step 4: Проверить CSS не сломан**

Run: `node -e "const css=require('fs').readFileSync('packages/web-client/public/css/shared-components.css','utf8'); const opens=(css.match(/{/g)||[]).length; const closes=(css.match(/}/g)||[]).length; console.log('braces',opens,closes,opens===closes?'OK':'MISMATCH')"`
Expected: `braces N N OK`

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/public/js/ui/hint-banner.js packages/web-client/public/css/shared-components.css
git commit -m "feat: shared HintBanner component (bb-hint) with info/success/warning/error variants"
```

---

### Task 2: i18n ключи блока `hint` во все 8 языков

**Files:**
- Modify: `packages/web-client/public/locales/{en,ru,es,fr,de,pt,ja,zh}/common.json` (добавить блок `hint` рядом с блоком `howto`)

**Interfaces:**
- Produces: ключи `hint.sessionExpired`, `hint.sessionExpiredMsg`, `hint.sessionNotFound`, `hint.sessionNotFoundMsg`, `hint.createNewSession`, `hint.close`.

- [ ] **Step 1: Добавить блок `hint` в `en/common.json`**

Найти в файле блок `"howto": {` и вставить перед ним (или после) блок `hint`. Использовать node-скрипт для точечной вставки, чтобы не сломать JSON вручную:

```bash
cd packages/web-client && node -e "
const fs=require('fs');
const path='public/locales/en/common.json';
const j=JSON.parse(fs.readFileSync(path,'utf8'));
j.hint={
  sessionExpired:'Session expired',
  sessionExpiredMsg:'Your session has expired or was removed from the server. Create a new session to continue.',
  sessionNotFound:'Session not found',
  sessionNotFoundMsg:'This link is outdated or was deleted. Create a new session to continue.',
  createNewSession:'Create new session',
  close:'Close hint'
};
fs.writeFileSync(path, JSON.stringify(j,null,2)+'\n');
console.log('en ok');
"
```

- [ ] **Step 2: Добавить блок `hint` в `ru/common.json`**

```bash
cd packages/web-client && node -e "
const fs=require('fs');
const path='public/locales/ru/common.json';
const j=JSON.parse(fs.readFileSync(path,'utf8'));
j.hint={
  sessionExpired:'Сессия истекла',
  sessionExpiredMsg:'Ваша сессия истекла или была удалена с сервера. Создайте новую сессию, чтобы продолжить.',
  sessionNotFound:'Сессия не найдена',
  sessionNotFoundMsg:'Эта ссылка устарела или была удалена. Создайте новую сессию, чтобы продолжить.',
  createNewSession:'Создать новую сессию',
  close:'Закрыть подсказку'
};
fs.writeFileSync(path, JSON.stringify(j,null,2)+'\n');
console.log('ru ok');
"
```

- [ ] **Step 3: Добавить блок `hint` в `es`, `fr`, `de`, `pt`, `ja`, `zh`**

```bash
cd packages/web-client && node -e "
const fs=require('fs');
const t={
  es:{sessionExpired:'Sesión expirada',sessionExpiredMsg:'Tu sesión ha expirado o fue eliminada del servidor. Crea una sesión nueva para continuar.',sessionNotFound:'Sesión no encontrada',sessionNotFoundMsg:'Este enlace está desactualizado o fue eliminado. Crea una sesión nueva para continuar.',createNewSession:'Crear sesión nueva',close:'Cerrar sugerencia'},
  fr:{sessionExpired:'Session expirée',sessionExpiredMsg:'Votre session a expiré ou a été supprimée du serveur. Créez une nouvelle session pour continuer.',sessionNotFound:'Session introuvable',sessionNotFoundMsg:'Ce lien est obsolète ou a été supprimé. Créez une nouvelle session pour continuer.',createNewSession:'Créer une session',close:'Fermer le conseil'},
  de:{sessionExpired:'Sitzung abgelaufen',sessionExpiredMsg:'Ihre Sitzung ist abgelaufen oder wurde vom Server entfernt. Erstellen Sie eine neue Sitzung, um fortzufahren.',sessionNotFound:'Sitzung nicht gefunden',sessionNotFoundMsg:'Dieser Link ist veraltet oder wurde gelöscht. Erstellen Sie eine neue Sitzung, um fortzufahren.',createNewSession:'Neue Sitzung erstellen',close:'Hinweis schließen'},
  pt:{sessionExpired:'Sessão expirada',sessionExpiredMsg:'Sua sessão expirou ou foi removida do servidor. Crie uma nova sessão para continuar.',sessionNotFound:'Sessão não encontrada',sessionNotFoundMsg:'Este link está desatualizado ou foi removido. Crie uma nova sessão para continuar.',createNewSession:'Criar nova sessão',close:'Fechar dica'},
  ja:{sessionExpired:'セッションの有効期限切れ',sessionExpiredMsg:'セッションの有効期限が切れたか、サーバーから削除されました。続けるには新しいセッションを作成してください。',sessionNotFound:'セッションが見つかりません',sessionNotFoundMsg:'このリンクは古いか削除されています。続けるには新しいセッションを作成してください。',createNewSession:'新しいセッションを作成',close:'ヒントを閉じる'},
  zh:{sessionExpired:'会话已过期',sessionExpiredMsg:'您的会话已过期或已从服务器删除。请创建新会话以继续。',sessionNotFound:'未找到会话',sessionNotFoundMsg:'此链接已过期或已被删除。请创建新会话以继续。',createNewSession:'创建新会话',close:'关闭提示'}
};
for(const lang of ['es','fr','de','pt','ja','zh']){
  const path='public/locales/'+lang+'/common.json';
  const j=JSON.parse(fs.readFileSync(path,'utf8'));
  j.hint=t[lang];
  fs.writeFileSync(path, JSON.stringify(j,null,2)+'\n');
  console.log(lang+' ok');
}
"
```

- [ ] **Step 4: Проверить JSON и полноту**

Run: `cd packages/web-client && node -e "const fs=require('fs'); for(const lang of ['en','ru','es','fr','de','pt','ja','zh']){const j=JSON.parse(fs.readFileSync('public/locales/'+lang+'/common.json','utf8')); const need=['sessionExpired','sessionExpiredMsg','sessionNotFound','sessionNotFoundMsg','createNewSession','close']; const missing=need.filter(k=>!j.hint||j.hint[k]===undefined); console.log(lang, missing.length?('MISSING: '+missing.join(',')):'OK')}"`
Expected: 8 строк `OK`, без MISSING.

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/public/locales/
git commit -m "feat(i18n): hint block keys in all 8 languages (session expired/not found, create new session)"
```

---

### Task 3: Контроллер — рендер `links.tip` и hotkeys-подсказки

**Files:**
- Modify: `packages/web-client/public/session-controller.html` (контейнеры + script-тег)
- Modify: `packages/web-client/src/controller.js` (функция `initHintSystem` + вызов)

**Interfaces:**
- Consumes: `globalThis.HintBanner` (Task 1), ключи `links.tip`, `controller.hotkeysTitle`, `controller.hotkeySpaceKey/Action`, `controller.hotkeyFKey/FAction`, `controller.hotkeyArrowsKeys/Action`, `controller.hotkeyCtrlSAction`, `hint.close` (Task 2).
- Produces: контейнеры `#linkTipContainer` и `#hotkeysHintContainer`; функция `initHintSystem()` (не экспортируется глобально, вызывается внутри).

- [ ] **Step 1: Добавить контейнеры и script-тег в `session-controller.html`**

После закрывающего `</div>` элемента `.link-group` (строка ~565, перед `</section>` секции Session) добавить:

```html
          <div id="linkTipContainer"></div>
          <div id="hotkeysHintContainer"></div>
```

Перед `<script src="/js/ui/settings-modal.js" ...>` (строка ~929) добавить:

```html
    <script src="/js/ui/hint-banner.js?v=2.39.794-4826549e" defer></script>
```

(суффикс версии — такой же, как у соседних ресурсов в файле; см. `grep -o 'v=[0-9.]*-[a-f0-9]*' public/session-controller.html | head -1`)

- [ ] **Step 2: Добавить `initHintSystem()` в `src/controller.js`**

Вставить функцию перед `function showCriticalError` (строка ~1772):

```js
/**
 * Единая система подсказок контроллера: tip про ссылки + hotkeys.
 * Использует общий компонент HintBanner (public/js/ui/hint-banner.js).
 */
function initHintSystem() {
  if (typeof globalThis.HintBanner !== 'function') return
  const t = (key, fallback) => globalThis.i18n?.t(key) || fallback

  // 1. 💡 Сохраните эти ссылки (links.tip)
  const tipContainer = document.getElementById('linkTipContainer')
  if (tipContainer) {
    new globalThis.HintBanner({
      container: tipContainer,
      type: 'info',
      message: t('links.tip', '<strong>Save these links!</strong> They are permanent and will always work.'),
      dismissKey: 'bb_hint_links_tip_dismissed',
      closeLabel: t('hint.close', 'Close hint')
    }).show()
  }

  // 2. ⌨️ Горячие клавиши
  const hkContainer = document.getElementById('hotkeysHintContainer')
  if (hkContainer) {
    const hotkeysHtml =
      '<kbd>Space</kbd> ' + t('controller.hotkeySpaceAction', '— Start/Stop') +
      ' &nbsp;·&nbsp; <kbd>F</kbd> ' + t('controller.hotkeyFAction', '— Fullscreen') +
      ' &nbsp;·&nbsp; <kbd>↑↓←→</kbd> ' + t('controller.hotkeyArrowsAction', '— Direction') +
      ' &nbsp;·&nbsp; <kbd>Ctrl+S</kbd> ' + t('controller.hotkeyCtrlSAction', '— Save preset')
    new globalThis.HintBanner({
      container: hkContainer,
      type: 'info',
      icon: '⌨️',
      title: t('controller.hotkeysTitle', '⌨️ Hotkeys'),
      message: hotkeysHtml,
      dismissKey: 'bb_hotkeys_hint_dismissed',
      closeLabel: t('hint.close', 'Close hint')
    }).show()
  }
}
```

Вызвать `initHintSystem()` в DOMContentLoaded-обработчике (строка ~149), сразу после `bbCounters.initDom()`:

```js
document.addEventListener('DOMContentLoaded', () => {
  initializeController().catch(debugError)
  bbCounters.initDom()
  initHintSystem()
  ...
```

- [ ] **Step 3: Собрать и проверить**

Run: `cd packages/web-client && npx webpack --mode development 2>&1 | tail -5`
Expected: `webpack ... compiled successfully` (или exit 0).

- [ ] **Step 4: Вручную проверить в браузере (playwright)**

- Открыть `http://localhost:3000/c/<валидный sessionId>` (или dev-сервер) — под полем ссылки виден баннер «💡 Сохраните эти ссылки!», ниже — «⌨️ Hotkeys» с kbd-клавишами.
- Нажать «×» на tip-баннере → баннер исчезает; перезагрузить страницу → больше не появляется (localStorage `bb_hint_links_tip_dismissed`).
- Тёмная/светлая тема — баннеры читаемы.

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/public/session-controller.html packages/web-client/src/controller.js
git commit -m "feat(controller): render links.tip and hotkeys hints via shared HintBanner"
```

---

### Task 4: Контроллер — статус «waiting for viewer» как пилюля

**Files:**
- Modify: `packages/web-client/public/css/controller.css` (append стилей пилюли)

**Interfaces:**
- Consumes: существующий элемент `#viewerStatus` с классами `.connected`/`.disconnected` (управляются в `src/application/controller/viewer-status.js` — НЕ менять).

- [ ] **Step 1: Добавить стили пилюли в конец `controller.css`**

```bash
cat >> packages/web-client/public/css/controller.css << 'EOF'
#viewerStatus{display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:3px 10px 3px 8px;border-radius:999px;font-size:.78rem;font-weight:600;vertical-align:middle;transition:all .25s ease;position:relative}
#viewerStatus::before{content:"";width:7px;height:7px;border-radius:50%;flex-shrink:0;background:currentColor;opacity:.9}
#viewerStatus.disconnected{background:rgb(245 158 11/.12);border:1px solid rgb(245 158 11/.35);color:#f59e0b}
#viewerStatus.disconnected::before{animation:bbStatusPulse 1.6s ease-in-out infinite}
#viewerStatus.connected{background:rgb(34 197 94/.12);border:1px solid rgb(34 197 94/.35);color:#22c55e;font-weight:600}
#viewerStatus.connected::before{box-shadow:0 0 0 0 rgb(34 197 94/.5);animation:bbStatusPulse 2s ease-in-out infinite}
@keyframes bbStatusPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.82)}}
.light-theme #viewerStatus.disconnected{background:rgb(245 158 11/.1);border-color:rgb(245 158 11/.4);color:#b45309}
.light-theme #viewerStatus.connected{background:rgb(34 197 94/.1);border-color:rgb(34 197 94/.4);color:#15803d}
@media (max-width:640px){#viewerStatus{margin-left:4px;padding:2px 8px 2px 6px;font-size:.72rem}}
EOF
```

- [ ] **Step 2: Проверить braces**

Run: `node -e "const css=require('fs').readFileSync('packages/web-client/public/css/controller.css','utf8'); const o=(css.match(/{/g)||[]).length,c=(css.match(/}/g)||[]).length; console.log('braces',o,c,o===c?'OK':'MISMATCH')"`
Expected: `braces N N OK`

- [ ] **Step 3: Проверить в браузере**

- Контроллер с неподключённым viewer: рядом со ссылкой оранжевая пульсирующая пилюля «Waiting...».
- Подключить viewer → пилюля становится зелёной «Connected».
- `#viewerStatus` сохраняет id и текст (e2e не сломано).

- [ ] **Step 4: Commit**

```bash
git add packages/web-client/public/css/controller.css
git commit -m "feat(controller): viewer status as pulsing pill (waiting/connected)"
```

---

### Task 5: Контроллер — `showCriticalError` с CTA «Создать новую сессию»

**Files:**
- Modify: `packages/web-client/src/controller.js` (функция `showCriticalError`, строка ~1772)

**Interfaces:**
- Consumes: `globalThis.HintBanner`, ключи `hint.sessionExpired`, `hint.sessionExpiredMsg`, `hint.createNewSession`, `hint.close`, `viewer.reload` (Task 2).
- Produces: поведение — критические ошибки рендерятся баннером `bb-hint--error` с двумя действиями: «Создать новую сессию» → `location.href = '/'`, «Reload» → `location.reload()`. Fallback — прежняя логика.

- [ ] **Step 1: Заменить тело `showCriticalError`**

Найти функцию (строка ~1772):

```js
function showCriticalError(title, message) {
  if (globalThis.errorStateManager?.show) {
```

Заменить всю функцию `showCriticalError` на:

```js
function showCriticalError(title, message) {
  const t = (key, fallback) => globalThis.i18n?.t(key) || fallback
  if (typeof globalThis.HintBanner === 'function') {
    new globalThis.HintBanner({
      container: document.getElementById('errorStatesContainer') || document.body,
      type: 'error',
      title: title,
      message: message,
      ctaLabel: t('hint.createNewSession', 'Create new session'),
      onCta: () => { globalThis.location.href = '/' },
      closeLabel: t('hint.close', 'Close hint'),
      ariaLive: 'assertive'
    }).show()
    return
  }
  if (globalThis.errorStateManager?.show) {
    globalThis.errorStateManager.show('critical-error', {
      title: title,
      message: message,
      actions: [
        {
          label: t('hint.createNewSession', 'Create new session'),
          callback: () => { globalThis.location.href = '/' }
        },
        {
          label: t('viewer.reload', 'Reload page'),
          callback: () => globalThis.location.reload()
        }
      ]
    })
  } else if (globalThis.emdrErrorOverlay) {
    globalThis.emdrErrorOverlay.show({
      title,
      message,
      actionText: t('viewer.reload', 'Reload page'),
      onAction: () => globalThis.location.reload()
    })
  } else {
    alert(`${title}\n\n${message}`)
  }
}
```

- [ ] **Step 2: Проверить, что `showCriticalError` вызывается до/после загрузки HintBanner корректно**

HintBanner грузится `defer`-тегом ДО `controller.bundle.js` (Task 3 Step 1), поэтому к моменту `DOMContentLoaded` (когда запускается `initializeController`) `globalThis.HintBanner` уже определён. Проверить порядок script-тегов в `session-controller.html`.

- [ ] **Step 3: Собрать**

Run: `cd packages/web-client && npx webpack --mode development 2>&1 | tail -5`
Expected: compiled successfully.

- [ ] **Step 4: Проверить в браузере**

- Открыть `/c/несуществующий-id` → красный баннер «Сессия не найдена…» с кнопкой «Создать новую сессию».
- Нажать кнопку → переход на `/` (главная).
- (Session Expired — через серверное `session_lost`, проверить по возможности на dev.)

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/src/controller.js
git commit -m "feat(controller): critical errors render as bb-hint error with Create-new-session CTA"
```

---

### Task 6: Viewer — протухшая ссылка → баннер с CTA

**Files:**
- Modify: `packages/web-client/public/viewer.html` (контейнер + script-тег)
- Modify: `packages/web-client/src/viewer.js` (catch-блок инициализации)

**Interfaces:**
- Consumes: `globalThis.HintBanner`, ключи `hint.sessionNotFound`, `hint.sessionNotFoundMsg`, `hint.createNewSession`, `hint.close`, `viewer.reload`.
- Produces: при «Session not found» viewer показывает баннер `bb-hint--error` с CTA «Создать новую сессию» и «Reload». Остальные ошибки — прежний `showError`.

- [ ] **Step 1: Добавить контейнер и script-тег в `viewer.html`**

В `<main class="viewer-container">` после `</div>` ошибки `errorBar` (строка ~151) добавить:

```html
      <div id="errorStatesContainer" class="error-states-container"></div>
```

Перед `<script src="/js/ui/error-states.js" ...>` (строка ~153) добавить:

```html
    <script src="/js/ui/hint-banner.js?v=2.39.794-4826549e" defer></script>
```

(суффикс версии — как у соседних ресурсов в `viewer.html`)

- [ ] **Step 2: Добавить стили контейнера для viewer в конец `viewer.css`**

```bash
cat >> packages/web-client/public/css/viewer.css << 'EOF'
.error-states-container{position:fixed;bottom:70px;left:0;right:0;z-index:2000;display:flex;justify-content:center;padding:0 16px;pointer-events:none}
.error-states-container .bb-hint{pointer-events:auto;max-width:520px;width:100%}
@media (max-width:640px){.error-states-container{bottom:60px}}
EOF
```

- [ ] **Step 3: Обновить catch-блок в `src/viewer.js`**

Найти (строка ~575):

```js
  } catch (error) {
    debugError('❌ Критическая ошибка инициализации:', error)
    let errorMsg = error.message || error
    if (
      errorMsg?.includes('Session with this ID not found') ||
      errorMsg?.includes('not found')
    ) {
      errorMsg =
        'Session with this ID not found. Please check the URL and try again.'
    } else if (errorMsg?.includes('Realtime connection')) {
      errorMsg =
        'Failed to connect to session. Please reload the page and try again.'
    }
    showError(errorMsg)
  }
```

Заменить на:

```js
  } catch (error) {
    debugError('❌ Критическая ошибка инициализации:', error)
    let errorMsg = error.message || error
    if (
      errorMsg?.includes('Session with this ID not found') ||
      errorMsg?.includes('not found')
    ) {
      const t = (key, fallback) => globalThis.i18n?.t(key) || fallback
      if (typeof globalThis.HintBanner === 'function') {
        const container =
          document.getElementById('errorStatesContainer') || document.body
        const banner = new globalThis.HintBanner({
          container: container,
          type: 'error',
          title: t('hint.sessionNotFound', 'Session not found'),
          message: t(
            'hint.sessionNotFoundMsg',
            'This link is outdated or was deleted. Create a new session to continue.'
          ),
          ctaLabel: t('hint.createNewSession', 'Create new session'),
          onCta: () => { globalThis.location.href = '/' },
          closeLabel: t('hint.close', 'Close hint'),
          ariaLive: 'assertive'
        })
        banner.show()
        const loading = document.getElementById('loading')
        if (loading) loading.style.display = 'none'
        return
      }
      errorMsg = t(
        'hint.sessionNotFoundMsg',
        'This link is outdated or was deleted. Create a new session to continue.'
      )
    } else if (errorMsg?.includes('Realtime connection')) {
      errorMsg =
        'Failed to connect to session. Please reload the page and try again.'
    }
    showError(errorMsg)
  }
```

- [ ] **Step 4: Собрать и проверить**

Run: `cd packages/web-client && npx webpack --mode development 2>&1 | tail -5`
Expected: compiled successfully.

В браузере: открыть `/s/несуществующий-id` → поверх экрана баннер «Сессия не найдена» с кнопкой «Создать новую сессию» → переход на `/`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-client/public/viewer.html packages/web-client/src/viewer.js packages/web-client/public/css/viewer.css
git commit -m "feat(viewer): session-not-found shows bb-hint error with create-new-session CTA"
```

---

### Task 7: Полная верификация

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: `0 problems` (без новых ошибок). Если линтер ругается на новые файлы — исправить.

- [ ] **Step 2: Сборка**

Run: `npm run build`
Expected: exit 0, webpack compiled successfully, i18n IIFE сгенерирован.

- [ ] **Step 3: E2E против локального dev**

Run: `npm run test:local`
Expected: все тесты зелёные (главная, контроллер, viewer, статус connected).

- [ ] **Step 4: Проверить итоговый diff**

Run: `git log --oneline -8`
Ожидается 7 коммитов (spec + 6 task-коммитов) поверх предыдущих.

---

### Task 8: Пуш в main и деплой в dev

- [ ] **Step 1: Пуш в origin/main**

```bash
git push origin main
```

- [ ] **Step 2: Деплой dev**

```bash
npm run deploy:dev
```
Expected: `✅ Deployment completed` (rsync на `dev.emdrbilateral.online`).

- [ ] **Step 3: Проверка на dev**

Run: `npm run test:dev`
Expected: все тесты зелёные. Дополнительно открыть `https://dev.emdrbilateral.online/c/<id>` — баннер links.tip, hotkeys, пилюля статуса; `/s/<битый-id>` — баннер «Сессия не найдена».
