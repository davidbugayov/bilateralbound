/* global globalThis */
'use strict'

const React = require('react')
const ReactDOM = require('react-dom/client')
const {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} = require('recharts')

const e = React.createElement

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}h ${m}m ${s}s`
  }
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function formatDurationShort(ms) {
  if (!ms || ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function t(key, fallback) {
  if (typeof globalThis !== 'undefined' && globalThis.i18n?.t) {
    const val = globalThis.i18n.t(key)
    if (val && val !== key) return val
  }
  return fallback
}

/**
 * Custom Tooltip for Recharts Line Chart
 */
function CustomChartTooltip(props) {
  const { active, payload } = props
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload
  if (!data) return null

  const isLight = typeof document !== 'undefined' && document.body.classList.contains('light-theme')

  return e(
    'div',
    {
      className: `slog-chart-tooltip ${isLight ? 'light' : 'dark'}`,
      style: {
        background: isLight ? '#ffffff' : '#0f172a',
        border: `1px solid ${isLight ? '#e2e8f0' : '#334155'}`,
        boxShadow: isLight
          ? '0 6px 20px rgba(0,0,0,0.1)'
          : '0 8px 24px rgba(0,0,0,0.6)',
        borderRadius: '10px',
        padding: '10px 14px',
        minWidth: '200px',
        maxWidth: '280px',
        fontSize: '12px',
        lineHeight: 1.4,
        color: isLight ? '#1e293b' : '#f8fafc',
        pointerEvents: 'none'
      }
    },
    e('div', { style: { fontWeight: 700, fontSize: '13px', marginBottom: '4px', color: isLight ? '#0284c7' : '#38bdf8' } }, data.title),
    e('div', { style: { fontSize: '11px', color: isLight ? '#64748b' : '#94a3b8', marginBottom: '8px' } }, data.fullDate),
    e(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '3px', borderTop: `1px solid ${isLight ? '#f1f5f9' : '#1e293b'}`, paddingTop: '6px' } },
      e(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } },
        e('span', { style: { color: isLight ? '#64748b' : '#94a3b8' } }, '⏱️ ' + t('controller.sessionLog.chartSessionDuration', 'Duration') + ':'),
        e('strong', { style: { color: isLight ? '#0f172a' : '#ffffff', fontVariantNumeric: 'tabular-nums' } }, data.formattedDuration + ` (${data.durationMinutes} min)`)
      ),
      e(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } },
        e('span', { style: { color: isLight ? '#64748b' : '#94a3b8' } }, '↔️ ' + t('controller.sessionLog.passes', 'Passes') + ':'),
        e('strong', { style: { fontVariantNumeric: 'tabular-nums' } }, String(data.passes))
      ),
      e(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } },
        e('span', { style: { color: isLight ? '#64748b' : '#94a3b8' } }, '🔢 ' + t('controller.sessionLog.sets', 'Sets') + ':'),
        e('strong', { style: { fontVariantNumeric: 'tabular-nums' } }, String(data.sets))
      )
    ),
    data.patternsSummary
      ? e('div', { style: { marginTop: '6px', fontSize: '11px', color: isLight ? '#475569' : '#cbd5e1' } }, `🎯 ${data.patternsSummary}`)
      : null,
    data.notes
      ? e('div', { style: { marginTop: '6px', fontSize: '11px', fontStyle: 'italic', color: isLight ? '#64748b' : '#94a3b8', borderLeft: '2px solid #38bdf8', paddingLeft: '6px' } }, `"${data.notes}"`)
      : null
  )
}

/**
 * Main Session Duration Chart React Component
 */
function SessionDurationChart(props) {
  const { logs = [], onGenerateDemoData } = props

  const [timeRange, setTimeRange] = React.useState('all') // 'all' | '30d' | '7d' | '10recent'
  const [metric, setMetric] = React.useState('duration') // 'duration' | 'passes' | 'sets'
  const [isLight, setIsLight] = React.useState(
    typeof document !== 'undefined' ? document.body.classList.contains('light-theme') : false
  )

  React.useEffect(() => {
    const handleThemeChange = () => {
      setIsLight(document.body.classList.contains('light-theme'))
    }
    if (typeof globalThis.MutationObserver === 'function') {
      const observer = new globalThis.MutationObserver(handleThemeChange)
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
      return () => observer.disconnect()
    }
  }, [])

  // Process and filter data
  const processedData = React.useMemo(() => {
    if (!logs || !logs.length) return []

    // Sort chronologically (oldest to newest for timeline view)
    const sorted = [...logs].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.startedAt || 0).getTime()
      const timeB = new Date(b.createdAt || b.startedAt || 0).getTime()
      return timeA - timeB
    })

    const now = Date.now()
    const filtered = sorted.filter((item) => {
      const itemTime = new Date(item.createdAt || item.startedAt || 0).getTime()
      if (timeRange === '7d') {
        return now - itemTime <= 7 * 86400000
      }
      if (timeRange === '30d') {
        return now - itemTime <= 30 * 86400000
      }
      return true
    })

    const sliced = timeRange === '10recent' ? filtered.slice(-10) : filtered

    return sliced.map((item, idx) => {
      const d = new Date(item.createdAt || item.startedAt || now)
      const durationMs = item.activeDurationMs || 0
      const durationSec = Math.round(durationMs / 1000)
      const durationMin = Number((durationMs / 60000).toFixed(1))

      let label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      if (!label || label === 'Invalid Date') {
        label = `S${idx + 1}`
      }

      let patternsSummary = ''
      if (item.patterns && Array.isArray(item.patterns) && item.patterns.length) {
        patternsSummary = item.patterns.map((p) => p.name || p.direction).filter(Boolean).join(', ')
      } else if (item.currentPattern?.name) {
        patternsSummary = item.currentPattern.name
      }

      return {
        id: item.id || `s-${idx}`,
        title: item.title || `Session ${idx + 1}`,
        rawDate: d,
        label,
        fullDate: d.toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        durationMs,
        durationSeconds: durationSec,
        durationMinutes: durationMin,
        formattedDuration: formatDurationShort(durationMs),
        passes: item.totalPasses || 0,
        sets: item.totalSets || 0,
        patternsSummary,
        notes: (item.notes || '').trim()
      }
    })
  }, [logs, timeRange])

  // Summary statistics
  const stats = React.useMemo(() => {
    if (!processedData.length) {
      return { totalSessions: 0, totalDurationMs: 0, avgDurationMs: 0, maxDurationMs: 0, avgValue: 0 }
    }
    const totalSessions = processedData.length
    let totalDurationMs = 0
    let maxDurationMs = 0
    let totalMetricValue = 0

    for (const d of processedData) {
      totalDurationMs += d.durationMs
      if (d.durationMs > maxDurationMs) maxDurationMs = d.durationMs
      if (metric === 'duration') totalMetricValue += d.durationMinutes
      else if (metric === 'passes') totalMetricValue += d.passes
      else if (metric === 'sets') totalMetricValue += d.sets
    }

    const avgDurationMs = Math.round(totalDurationMs / totalSessions)
    const avgValue = Number((totalMetricValue / totalSessions).toFixed(1))

    return {
      totalSessions,
      totalDurationMs,
      avgDurationMs,
      maxDurationMs,
      avgValue
    }
  }, [processedData, metric])

  const lineColor = isLight ? '#0284c7' : '#38bdf8'
  const gridColor = isLight ? 'rgba(203, 213, 225, 0.4)' : 'rgba(71, 85, 105, 0.25)'
  const axisColor = isLight ? '#64748b' : '#94a3b8'
  const dotFill = isLight ? '#ffffff' : '#0f172a'

  const currentDataKey =
    metric === 'duration' ? 'durationMinutes' : metric === 'passes' ? 'passes' : 'sets'

  const metricUnit = metric === 'duration' ? 'm' : ''

  // Empty state if no data available
  if (!logs || logs.length === 0 || !processedData.length) {
    return e(
      'div',
      { className: 'slog-chart-empty-state' },
      e('div', { className: 'slog-chart-empty-icon' }, '📈'),
      e(
        'h4',
        { className: 'slog-chart-empty-title' },
        t('controller.sessionLog.chartEmptyTitle', 'No Session Data Recorded Yet')
      ),
      e(
        'p',
        { className: 'slog-chart-empty-desc' },
        t(
          'controller.sessionLog.chartEmptyDesc',
          'Run an EMDR exercise or load sample data to visualize session duration trends over time.'
        )
      ),
      onGenerateDemoData
        ? e(
            'button',
            {
              type: 'button',
              className: 'slog-btn slog-btn--primary slog-chart-demo-btn',
              onClick: onGenerateDemoData
            },
            '⚡ ' + t('controller.sessionLog.chartDemoBtn', 'Load Sample Data')
          )
        : null
    )
  }

  return e(
    'div',
    { className: 'slog-recharts-container' },

    // Metric Summary KPI cards
    e(
      'div',
      { className: 'slog-chart-kpis' },
      e(
        'div',
        { className: 'slog-kpi-card' },
        e('div', { className: 'slog-kpi-label' }, t('controller.sessionLog.chartSessionsCount', 'Sessions Tracked')),
        e('div', { className: 'slog-kpi-value' }, String(stats.totalSessions))
      ),
      e(
        'div',
        { className: 'slog-kpi-card' },
        e('div', { className: 'slog-kpi-label' }, t('controller.sessionLog.chartTotalTime', 'Total Therapy Time')),
        e('div', { className: 'slog-kpi-value highlight' }, formatDuration(stats.totalDurationMs))
      ),
      e(
        'div',
        { className: 'slog-kpi-card' },
        e('div', { className: 'slog-kpi-label' }, t('controller.sessionLog.chartAvgDuration', 'Average Duration')),
        e('div', { className: 'slog-kpi-value' }, formatDuration(stats.avgDurationMs))
      ),
      e(
        'div',
        { className: 'slog-kpi-card' },
        e('div', { className: 'slog-kpi-label' }, t('controller.sessionLog.chartMaxDuration', 'Peak Duration')),
        e('div', { className: 'slog-kpi-value' }, formatDuration(stats.maxDurationMs))
      )
    ),

    // Filter controls row (Segmented tabs conforming to anti-slop guidelines)
    e(
      'div',
      { className: 'slog-chart-controls' },
      e(
        'div',
        { className: 'slog-segmented-group', role: 'group', 'aria-label': 'Time range' },
        e(
          'button',
          {
            type: 'button',
            className: `slog-segment-btn ${timeRange === 'all' ? 'active' : ''}`,
            onClick: () => setTimeRange('all')
          },
          t('controller.sessionLog.chartRangeAll', 'All Time')
        ),
        e(
          'button',
          {
            type: 'button',
            className: `slog-segment-btn ${timeRange === '30d' ? 'active' : ''}`,
            onClick: () => setTimeRange('30d')
          },
          t('controller.sessionLog.chartRange30d', 'Last 30 Days')
        ),
        e(
          'button',
          {
            type: 'button',
            className: `slog-segment-btn ${timeRange === '7d' ? 'active' : ''}`,
            onClick: () => setTimeRange('7d')
          },
          t('controller.sessionLog.chartRange7d', 'Last 7 Days')
        ),
        e(
          'button',
          {
            type: 'button',
            className: `slog-segment-btn ${timeRange === '10recent' ? 'active' : ''}`,
            onClick: () => setTimeRange('10recent')
          },
          t('controller.sessionLog.chartRange10recent', 'Recent 10')
        )
      ),

      e(
        'div',
        { className: 'slog-segmented-group slog-metric-group', role: 'group', 'aria-label': 'Chart metric' },
        e(
          'button',
          {
            type: 'button',
            className: `slog-segment-btn ${metric === 'duration' ? 'active' : ''}`,
            onClick: () => setMetric('duration')
          },
          '⏱️ ' + t('controller.sessionLog.chartMetricDuration', 'Duration (min)')
        ),
        e(
          'button',
          {
            type: 'button',
            className: `slog-segment-btn ${metric === 'passes' ? 'active' : ''}`,
            onClick: () => setMetric('passes')
          },
          '↔️ ' + t('controller.sessionLog.chartMetricPasses', 'Passes')
        ),
        e(
          'button',
          {
            type: 'button',
            className: `slog-segment-btn ${metric === 'sets' ? 'active' : ''}`,
            onClick: () => setMetric('sets')
          },
          '🔢 ' + t('controller.sessionLog.chartMetricSets', 'Sets')
        )
      )
    ),

    // Recharts Responsive LineChart Wrapper
    e(
      'div',
      { className: 'slog-recharts-canvas-wrapper', style: { width: '100%', height: 230 } },
      e(
        ResponsiveContainer,
        { width: '100%', height: '100%' },
        e(
          LineChart,
          {
            data: processedData,
            margin: { top: 12, right: 16, left: -10, bottom: 4 }
          },
          e(CartesianGrid, {
            strokeDasharray: '3 3',
            stroke: gridColor,
            vertical: false
          }),
          e(XAxis, {
            dataKey: 'label',
            stroke: axisColor,
            tick: { fill: axisColor, fontSize: 11 },
            tickLine: false,
            axisLine: { stroke: gridColor }
          }),
          e(YAxis, {
            stroke: axisColor,
            tick: { fill: axisColor, fontSize: 11 },
            tickLine: false,
            axisLine: false,
            unit: metricUnit,
            domain: [0, 'auto']
          }),
          e(Tooltip, {
            content: e(CustomChartTooltip, null)
          }),
          stats.avgValue > 0
            ? e(ReferenceLine, {
                y: stats.avgValue,
                stroke: '#10b981',
                strokeDasharray: '4 4',
                strokeOpacity: 0.8,
                label: {
                  value: `${t('controller.sessionLog.chartAverageLine', 'Avg')}: ${stats.avgValue}${metricUnit}`,
                  fill: '#10b981',
                  fontSize: 10,
                  position: 'insideTopRight'
                }
              })
            : null,
          e(Line, {
            type: 'monotone',
            dataKey: currentDataKey,
            stroke: lineColor,
            strokeWidth: 2.5,
            dot: {
              r: 4,
              fill: dotFill,
              stroke: lineColor,
              strokeWidth: 2
            },
            activeDot: {
              r: 6,
              fill: lineColor,
              stroke: isLight ? '#ffffff' : '#0f172a',
              strokeWidth: 2
            },
            isAnimationActive: true,
            animationDuration: 600
          })
        )
      )
    )
  )
}

/**
 * Mounts or updates the Recharts Session Duration Chart in the designated DOM container.
 * @param {HTMLElement} containerEl
 * @param {Array} logs
 * @param {Function} [onGenerateDemoData]
 */
function mountSessionDurationChart(containerEl, logs = [], onGenerateDemoData = null) {
  if (!containerEl) return

  if (!containerEl._reactRoot) {
    containerEl._reactRoot = ReactDOM.createRoot(containerEl)
  }

  containerEl._reactRoot.render(
    e(SessionDurationChart, {
      logs,
      onGenerateDemoData
    })
  )
}

/**
 * Unmounts the Recharts chart from container.
 * @param {HTMLElement} containerEl
 */
function unmountSessionDurationChart(containerEl) {
  if (containerEl && containerEl._reactRoot) {
    containerEl._reactRoot.unmount()
    delete containerEl._reactRoot
  }
}

module.exports = {
  SessionDurationChart,
  mountSessionDurationChart,
  unmountSessionDurationChart
}
