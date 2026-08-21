/* global Event, MutationObserver */
'use strict';
/**
 * Settings modal — tab switching, mirror syncing, language buttons, volume slider.
 * Extracted from session-controller.html to reduce inline script weight.
 */
(function () {
  const modal = document.getElementById('settingsModal');
  const openBtn = document.getElementById('settingsBtn');
  const closeBtn = document.getElementById('smodalClose');
  const overlay = document.getElementById('smodalOverlay');
  const tabs = modal.querySelectorAll('.smodal__tab');
  const panels = modal.querySelectorAll('.smodal__panel');
  const langBtns = modal.querySelectorAll('.smodal__lang-btn');

  function openModal(tabId) {
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    if (tabId) switchTab(tabId);
    closeBtn.focus();
    document.addEventListener('keydown', trapFocus);
  }

  function closeModal() {
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', trapFocus);
    openBtn.focus();
  }

  function trapFocus(e) {
    if (e.key !== 'Tab' || modal.hasAttribute('hidden')) return;
    const focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function switchTab(id) {
    tabs.forEach(function (t) {
      const active = t.dataset.tab === id;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    panels.forEach(function (p) {
      p.classList.toggle(
        'smodal__panel--hidden',
        p.id !== 'smodal-panel-' + id,
      );
    });
  }

  openBtn.addEventListener('click', function () {
    openModal();
  });
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      switchTab(t.dataset.tab);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hasAttribute('hidden')) closeModal();
  });

  // Language buttons
  function detectCurrentLang() {
    try {
      const p = new URLSearchParams(location.search).get('lang');
      if (p) return p;
    } catch (_) {
      /* ignore */
    }
    return (
      localStorage.getItem('emdr-language') ||
      navigator.language.split('-')[0] ||
      'en'
    );
  }

  function updateLangActive() {
    const cur = detectCurrentLang();
    langBtns.forEach(function (b) {
      b.classList.toggle('active', b.dataset.lang === cur);
    });
  }

  langBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const lang = btn.dataset.lang;
      try {
        localStorage.setItem('emdr-language', lang);
      } catch (_) {
        /* ignore */
      }
      try {
        const url = new URL(location.href);
        url.searchParams.set('lang', lang);
        history.replaceState({}, '', url);
      } catch (_) {
        /* ignore */
      }
      if (globalThis.i18n && globalThis.i18n.changeLanguage) {
        globalThis.i18n.changeLanguage(lang);
      }
      updateLangActive();
    });
  });

  updateLangActive();

  // Expose openModal for external callers
  globalThis.openSettingsModal = openModal;

  // Mirror controls: sync modal ↔ left-col
  function setupMirrors() {
    document.querySelectorAll('[data-mirror]').forEach(function (el) {
      const src = document.getElementById(el.dataset.mirror);
      if (!src) return;
      if (el.type === 'checkbox') el.checked = src.checked;
      else el.value = src.value;
      el.addEventListener('input', function () {
        if (el.type === 'checkbox') src.checked = el.checked;
        else src.value = el.value;
        src.dispatchEvent(new Event('input', { bubbles: true }));
        src.dispatchEvent(new Event('change', { bubbles: true }));
      });
      src.addEventListener('change', function () {
        if (src.type === 'checkbox') el.checked = src.checked;
        else el.value = src.value;
      });
      src.addEventListener('input', function () {
        if (src.type === 'checkbox') el.checked = src.checked;
        else el.value = src.value;
      });
    });
    document.querySelectorAll('[data-mirror-display]').forEach(function (span) {
      const src = document.getElementById(span.dataset.mirrorDisplay);
      if (!src) return;
      new MutationObserver(function () {
        span.textContent = src.textContent;
      }).observe(src, { childList: true, subtree: true, characterData: true });
      span.textContent = src.textContent;
    });
  }
  setupMirrors();

  // Volume slider gradient fill
  function updateSliderFill(slider) {
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--pct', pct + '%');
  }
  const volSlider = document.getElementById('controllerVolumeSlider');
  if (volSlider) {
    updateSliderFill(volSlider);
    volSlider.addEventListener('input', function () {
      updateSliderFill(volSlider);
    });
  }
})();
