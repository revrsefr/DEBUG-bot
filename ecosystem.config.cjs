module.exports = {
    apps: [
      {
        name: 'irc-monitor-bot',
        script: './bot.mjs', // The entry point of your bot application
        interpreter: 'node', // Ensure this is set to 'node'
        interpreter_args: '--experimental-modules', // Use this if you are using ES modules
        watch: true, // Enable watching file changes
        ignore_watch: ['node_modules', 'logs'], // Ignore changes in these directories
        env: {
          NODE_ENV: 'development',
        },
        env_production: {
          NODE_ENV: 'production',
        },
      },
    ],
  };