# SEO & Performance Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical SEO blockers and performance issues across emdrbilateral.online and emdrbilateral.ru.

**Architecture:** Static file edits (robots.txt, sitemap.xml, index.html) + server-side hreflang/canonical injection in expressApp.js. Deploy to main then stable.

**Tech Stack:** Vanilla JS, Express.js, Node.js, nginx

---

### Task 1: Fix robots.txt

**Files:**

- Modify: `packages/web-client/public/robots.txt`

**Changes:**
Remove these lines from global `User-agent: *` section:

```
Disallow: /*.css$
Disallow: /*.js$
Disallow: /*.map$
Disallow: /*.png$
Disallow: /*.jpg$
Disallow: /*.jpeg$
Disallow: /*.gif$
Disallow: /*.svg$
Disallow: /*.ico$
Disallow: /*.webp$
Disallow: /*.woff$
Disallow: /*.woff2$
Disallow: /*.ttf$
Disallow: /*.eot$
Disallow: /css/
Disallow: /js/
Disallow: /components/
Allow: /emdr-therapy/
```

Remove `Allow: /emdr-therapy/` from Googlebot and Yandex sections.

Remove the `Host: https://emdrbilateral.ru` line (non-standard, only Yandex uses it — keep it for Yandex specifically by moving to Yandex section).

Remove `Sitemap: https://emdrbilateral.online/sitemap.xml` — only one sitemap needed.

Keep all security-sensitive Disallow rules (admin, private, .git, .env, etc.)

**Verify:** `curl -s https://emdrbilateral.online/robots.txt | grep -E "css|js|emdr-therapy"`

**Commit:** `git commit -m "fix: unblock css/js for crawlers, remove /emdr-therapy/"`

---

### Task 2: Fix sitemap.xml

**Files:**

- Modify: `packages/web-client/public/sitemap.xml`

**Changes:**
Remove these URL entries:

- `/emdr-therapy/` (both domains)
- `/session-controller.html` (both domains) — app page, not landing
- `/viewer.html` (both domains) — app page, not landing
- `/components/` (both domains) — UI components, not content
- `/components/button.html` (both domains)
- `/components/html-head.html` (both domains)
- `/robots.txt` (both domains)
- `/sitemap.xml` (both domains)

Update ALL `lastmod` dates from `2026-02-17` to `2026-03-07`.

Keep: main pages `/` for both domains + verification files.

**Commit:** `git commit -m "fix: clean sitemap — remove app pages and update lastmod"`

---

### Task 3: Fix index.html — duplicate preload + schema.org

**Files:**

- Modify: `packages/web-client/public/index.html`

**Step 1: Remove duplicate preload**
Lines ~210-214 duplicate the preloads already at lines 31-35. Remove the comment `<!-- Preload critical resources -->` and the duplicate `<link as="style" href="/css/shared-components.css..." rel="preload" />` that appears for the second time.

Keep only ONE preload for each CSS file (the ones at lines 31-44).
Keep the actual stylesheet `<link rel="stylesheet">` tags.

**Step 2: Update schema.org**
Change `"softwareVersion": "2.39.90"` → `"softwareVersion": "2.39.226"`
Change `"dateModified": "2026-02-17"` → `"dateModified": "2026-03-07"`

**Commit:** `git commit -m "fix: remove duplicate CSS preload, update schema.org version"`

---

### Task 4: Server-side canonical + hreflang injection

**Files:**

- Modify: `packages/server-core/server/network/expressApp.js`

**Step 1: Add `injectCanonicalHreflang(html, host)` function** after `localizeHtml`:

```js
function injectCanonicalHreflang(html, host) {
  const isRu = host.endsWith(".ru");
  const ruBase = "https://emdrbilateral.ru";
  const onlineBase = "https://emdrbilateral.online";
  const canonicalUrl = isRu ? `${ruBase}/` : `${onlineBase}/`;

  // Replace hardcoded canonical
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${canonicalUrl}" />`,
  );

  // Inject hreflang tags after canonical
  const hreflang = [
    `<link rel="alternate" hreflang="ru" href="${ruBase}/" />`,
    `<link rel="alternate" hreflang="en" href="${onlineBase}/" />`,
    `<link rel="alternate" hreflang="de" href="${onlineBase}/?lang=de" />`,
    `<link rel="alternate" hreflang="es" href="${onlineBase}/?lang=es" />`,
    `<link rel="alternate" hreflang="fr" href="${onlineBase}/?lang=fr" />`,
    `<link rel="alternate" hreflang="pt" href="${onlineBase}/?lang=pt" />`,
    `<link rel="alternate" hreflang="ja" href="${onlineBase}/?lang=ja" />`,
    `<link rel="alternate" hreflang="zh" href="${onlineBase}/?lang=zh" />`,
    `<link rel="alternate" hreflang="x-default" href="${onlineBase}/" />`,
  ].join("\n    ");

  html = html.replace(/(<link rel="canonical"[^>]*\/>)/, `$1\n    ${hreflang}`);

  return html;
}
```

**Step 2: Call it in the `/` route handler** (expressApp.js, `app.get('/', ...)`) after `localizeHtml`:

```js
app.get("/", (req, res) => {
  const lang = detectLanguage(req, null);
  const locale = locales.get(lang) || locales.get("en");
  let html = localizeHtml(cachedIndexHtml, lang, locale, indexMetaMap);
  html = injectCanonicalHreflang(html, req.get("host") || "");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  setNoCacheHeaders(res);
  res.send(html);
});
```

**Verify:** `curl -s https://emdrbilateral.online/ | grep -E "canonical|hreflang"`

**Commit:** `git commit -m "feat: inject canonical and hreflang server-side per domain"`

---

### Task 5: Deploy to main and stable

**Step 1: Push main**

```bash
git push origin main
```

**Step 2: Deploy to dev (main)**

```bash
npm run deploy:dev
```

**Step 3: Merge main → stable and push**

```bash
git checkout stable
git merge main --no-edit
git push origin stable
git checkout main
```

**Step 4: Deploy to prod (stable)**

```bash
npm run deploy:prod
```

**Step 5: Verify live**

```bash
curl -s https://emdrbilateral.online/robots.txt | grep -c "Disallow"
curl -s https://emdrbilateral.ru/ | grep "hreflang"
curl -s https://emdrbilateral.online/sitemap.xml | grep "emdr-therapy"
```
