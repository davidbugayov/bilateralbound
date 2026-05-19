module.exports = {
  apps: [{
    name: 'bilateral-bound-dev',
    script: 'server/index.js',
    cwd: '/var/www/dev.emdrbilateral.online/packages/server-core',
    env: {
      NODE_ENV: 'production',
      PORT: 3003
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
  }]
};
