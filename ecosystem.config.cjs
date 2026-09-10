module.exports = {
  apps: [
    {
      name: 'NormScale',
      cwd: '/var/www/NormScale',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 4006',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4006,
      },
    },
  ],
};
