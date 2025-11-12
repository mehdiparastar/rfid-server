declare namespace NodeJS {
    export interface ProcessEnv {
        SERVER_PORT: string;
        NODE_ENV: 'development' | 'production';
        DB_PORT: string;
        MYSQL_ROOT_HOST: string;
        MYSQL_USER: string;
        MYSQL_PASSWORD: string;
        MYSQL_DATABASE: string;
        JWT_ACCESS_SECRET: string;
        JWT_REFRESH_SECRET: string;
        JWT_ACCESS_EXPIRATION_TIME: '10s' | '20s' | '60s';
        JWT_REFRESH_EXPIRATION_TIME: '30s' | '60s' | '900s' | '1500s' | '3000s';
    }

    interface Process {
        pkg?: {
            entrypoint: string;
            defaultEntrypoint: string;
            path: string;
        };
    }
}