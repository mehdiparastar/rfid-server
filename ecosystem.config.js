module.exports = {
    apps: [{
        name: 'rfid-backend',
        script: 'npm run start:prod',
        instances: 1,
        exec_mode: 'fork',       
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true
    }]
};