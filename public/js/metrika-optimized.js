'use strict'
/**
 * Оптимизированный счетчик Яндекс.Метрики
 * Решает проблемы с обнаружением и загрузкой
 */
;(function () {
  'use strict'
  // Конфигурация счетчика
  const METRIKA_ID = '104698530'
  const METRIKA_URL = 'https://mc.yandex.ru/metrika/tag.js'
  // Глобальные переменные для отслеживания состояния
  let metrikaLoaded = false
  let metrikaInitiated = false
  let loadAttempts = 0
  const MAX_ATTEMPTS = 3
  // Функция для создания и вставки счетчика
  function createMetrikaScript() {
    if (metrikaLoaded) return
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.async = true
    script.src = METRIKA_URL
    script.onload = function () {
      metrikaLoaded = true
      initMetrika()
    }

    script.onerror = function () {
      loadAttempts++
      console.warn(`⚠️ Ошибка загрузки Яндекс.Метрики (попытка ${loadAttempts}/${MAX_ATTEMPTS})`)
      if (loadAttempts < MAX_ATTEMPTS) {
        // Повторная попытка через 2 секунды
        setTimeout(createMetrikaScript, 2000)
      } else {
        console.error('❌ Яндекс.Метрика не удалось загрузить после нескольких попыток')
        // Создаем fallback счетчик
        createNoscriptFallback()
      }
    }
    // Ищем существующий скрипт Метрики и удаляем дубликаты
    const existingScripts = document.querySelectorAll('script[src*="metrika"]')
    for (const existing of existingScripts) {
      if (existing.src.includes(METRIKA_URL)) {
        existing.remove()
      }
    }
    // Вставляем новый скрипт в head
    const head = document.head || document.getElementsByTagName('head')[0]

    if (head) {
      head.insertBefore(script, head.firstChild)
    } else {
      document.documentElement.appendChild(script)
    }
  }
  // Функция инициализации Метрики
  function initMetrika() {
    if (metrikaInitiated || !globalThis.ym) {
      return
    }

    try {
      globalThis.ym(METRIKA_ID, 'init', {
        ssr: true,
        webvisor: true,
        clickmap: true,
        ecommerce: 'dataLayer',
        accurateTrackBounce: true,
        trackLinks: true,
        params: {
          windowTitle: document.title
        }
      })
      metrikaInitiated = true
      // Отправляем событие о загрузке страницы
      trackPageView()
    } catch (error) {
      console.error('❌ Ошибка инициализации Яндекс.Метрики:', error)
    }
  }
  // Функция отслеживания просмотра страницы
  function trackPageView() {
    if (metrikaInitiated && globalThis.ym) {
      try {
        globalThis.ym(METRIKA_ID, 'hit', globalThis.location.href, {
          referer: document.referrer,
          title: document.title
        })
      } catch (error) {
        console.error('❌ Ошибка отправки hit в Яндекс.Метрику:', error)
      }
    }
  }
  // Функция создания fallback счетчика
  function createNoscriptFallback() {
    const noscript = document.createElement('noscript')
    noscript.innerHTML =
      '<div><img src="https://mc.yandex.ru/watch/' +
      METRIKA_ID +
      '" style="position:absolute; left:-9999px;" alt="" /></div>'
    document.body.insertBefore(noscript, document.body.firstChild)
  }
  // Функция проверки доступности Метрики
  function checkMetrikaAvailability() {
    if (globalThis.ym !== undefined && globalThis.ym) {
      if (!metrikaInitiated) {
        initMetrika()
      }

      return true
    }

    return false
  }
  // Функция принудительной проверки состояния Метрики
  function forceCheckMetrika() {
    const startTime = Date.now()
    const checkInterval = setInterval(() => {
      if (checkMetrikaAvailability() || Date.now() - startTime > 5000) {
        clearInterval(checkInterval)
      }
    }, 100)
  }
  // Функция для отладки
  function debugMetrika() {
    if (globalThis.ym !== undefined) {
      /* empty */
    }
  }
  // Экспортируем функции для использования в других скриптах
  globalThis.MetrikaManager = {
    init: function () {
      createMetrikaScript()
    },
    track: function (params) {
      if (metrikaInitiated && globalThis.ym) {
        try {
          globalThis.ym(
            METRIKA_ID,
            'reachGoal',
            params.event,
            params.params ||
              {
                /* empty */
              }
          )
        } catch (error) {
          console.error('❌ Ошибка отправки события в Яндекс.Метрику:', error)
        }
      }
    },
    check: checkMetrikaAvailability,
    debug: debugMetrika,
    forceCheck: forceCheckMetrika
  }
  // Запуск загрузки счетчика
  if (document.readyState === 'loading') {
    // DOM еще не загружен
    document.addEventListener('DOMContentLoaded', function () {
      // Небольшая задержка для гарантированной загрузки
      setTimeout(createMetrikaScript, 100)
    })
  } else {
    // DOM уже загружен
    setTimeout(createMetrikaScript, 100)
  }
  // Экспонируем функцию для обратной совместимости
  globalThis.ym =
    globalThis.ym ||
    function () {
      const args = Array.prototype.slice.call(arguments)
      const method = args[1]

      if (method === 'init') {
        // Откладываем инициализацию
        setTimeout(() => {
          globalThis.ym?.q?.push(args)
        }, 100)
      } else {
        globalThis.ym?.q?.push(args)
      }
    }
  // очередь для отложенных вызовов
  globalThis.ym.q = globalThis.ym.q || []
  // Добавляем проверку через 5 секунд для гарантии
  setTimeout(forceCheckMetrika, 5000)
  // Экспонируем для отладки в консоли
})()
