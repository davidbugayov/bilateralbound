'use strict'
const AnalyticsCollector = require('../services/AnalyticsCollector')

// Known scanner paths — return 403 without logging to analytics
const SCANNER_PATHS = [
  '/.env', '/.env.production', '/.env.local', '/.env.backup', '/.env.save',
  '/.env.old', '/.env.example', '/.git/config', '/.git/HEAD',
  '/.htaccess', '/.htpasswd', '/.DS_Store', '/.vscode/sftp.json',
  '/.well-known/security.txt', '/.well-known/mcp.json', '/.well-known/agent.json',
  '/.well-known/ai-plugin.json', '/.secret', '/.config', '/.json',
  '/.clauderc', '/.claude/settings.json', '/.claude/claude.config.js',
  '/login', '/dashboard', '/graphql', '/v1/models', '/metrics',
  '/api/version', '/api/tags', '/queue/status', '/settings',
  '/config.js', '/config.json', '/Config.json', '/config',
  '/env', '/env.js', '/openapi.json', '/openapi.yaml', '/api/config',
  '/swagger.json', '/api/v1/version', '/api/health', '/api/status',
  '/mcp', '/messages', '/security.txt', '/actuator/health',
  '/debug/vars', '/docs', '/api/system', '/api/v1/auth',
  '/tools', '/api/tools', '/api/flows', '/server_info', '/api/v1/info',
  '/_debug', '/sse', '/invoke', '/output_schema', '/rest/workflows',
  '/geoserver/web/', '/panel', '/xui', '/manager/html', '/manager/text/list',
  '/test.php', '/_next', '/_next/server', '/app', '/api/route',
  '/SDK/webLanguage', '/wiki', '/docker-compose.yaml', '/docker-compose.yml',
  '/Dockerfile', '/dockerfile', '/docker-compose.override.yml',
  '/jars', '/service/extdirect', '/telescope/requests',
  '/claude.md', '/CLAUDE.md', '/PROMPT.md', '/server.py', '/main.py',
  '/server.go', '/main.js', '/api.json', '/s/lkx/_/',
  '/@fs/etc/passwd', '/cgi-bin/'
]

function isScannerPath(path) {
  if (!path) return false
  // Exact matches
  if (SCANNER_PATHS.includes(path)) return true
  // Prefix matches for traversal attempts
  if (path.includes('/../') || path.includes('/.%2e/') || path.includes('%2e%2e')) return true
  return false
}

module.exports = {
  name: 'analytics',
  version: '1.0.0',
  register(app, { config, logger }) {
    const analytics = new AnalyticsCollector(logger)

    // Bot filter — block known scanner paths BEFORE logging to analytics
    app.use((req, res, next) => {
      if (isScannerPath(req.path)) {
        return res.status(403).end()
      }
      next()
    })

    app.use((req, res, next) => {
      analytics.recordHttpRequest()
      res.on('finish', () => {
        if (res.statusCode >= 400) {
          analytics.recordHttpError(res.statusCode, req.path)
        }
      })
      next()
    })
    return analytics
  }
}
