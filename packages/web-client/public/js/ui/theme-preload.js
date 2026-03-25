(function () {
  try {
    // Check local storage or system preference
    // NOTE: Must match the key used in ThemeManager (common.js)
    const themeKey = 'bb_theme'

    // Theme is now received via WebSocket from controller, not from URL
    const savedTheme = localStorage.getItem(themeKey)

    // Default to dark if no preference saved (matching ThemeManager logic)
    // ThemeManager logic: savedTheme === 'dark' || savedTheme !== 'light'
    const isDark = savedTheme !== 'light'

    // 1. Set html background immediately to cover the viewport
    document.documentElement.style.backgroundColor = isDark
      ? '#0f172a'
      : '#f8fafc'

    // 2. Add preload class to html
    const preloadClass = isDark ? 'preload-dark' : 'preload-light'
    document.documentElement.classList.add(preloadClass)

    // 3. Inject temporary style to force body background
    // This overrides the default "mixed gradient" in shared-components.css
    const style = document.createElement('style')
    style.id = 'theme-preload-style'
    style.innerHTML = `
      html.preload-dark body { background: #0f172a !important; }
      html.preload-light body { background: #f8fafc !important; }
    `
    document.head.appendChild(style)

    // 4. Cleanup once the page is fully loaded
    // We use 'load' to ensure CSS is parsed and applied
    window.addEventListener('load', () => {
      // Remove preload classes
      document.documentElement.classList.remove(
        'preload-dark',
        'preload-light'
      )

      // Remove style tag
      const styleTag = document.getElementById('theme-preload-style')
      if (styleTag) styleTag.remove()

      // Reset html inline background (let CSS take over)
      document.documentElement.style.backgroundColor = ''
    })
  } catch (e) {
    console.error('Theme preload error:', e)
  }
})()
