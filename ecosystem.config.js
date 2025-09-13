module.exports = {
    apps: [{
        name: 'rfid-backend',
        script: 'dist/main.js',
        instances: 1,
        exec_mode: 'fork',
        env_production: {
            NODE_ENV: 'production',
            ...require('./.env.production')  // Loads your env
        },
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true
    }]
};