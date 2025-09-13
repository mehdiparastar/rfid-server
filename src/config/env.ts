// src/config/env.ts
import * as path from "path";
import { config } from "dotenv";

export function loadEnv() {
    console.log("starting server on path: ", process.cwd(), ` in '${process.env.NODE_ENV}' environment.`)
    const nodeEnv = process.env.NODE_ENV || "development"; // "development" | "production" | "test"
    const file = `.env.${nodeEnv}`;
    config({ path: path.resolve(process.cwd(), file) });
}

export enum envKeys {
    SERVER_PORT = "SERVER_PORT",
    NODE_ENV = "NODE_ENV",
    DB_PORT = "DB_PORT",
    MYSQL_ROOT_HOST = "MYSQL_ROOT_HOST",
    MYSQL_USER = "MYSQL_USER",
    MYSQL_PASSWORD = "MYSQL_PASSWORD",
    MYSQL_DATABASE = "MYSQL_DATABASE",
    JWT_ACCESS_SECRET = "JWT_ACCESS_SECRET",
    JWT_REFRESH_SECRET = "JWT_REFRESH_SECRET",
    JWT_ACCESS_EXPIRATION_TIME = "JWT_ACCESS_EXPIRATION_TIME",
    JWT_REFRESH_EXPIRATION_TIME = "JWT_REFRESH_EXPIRATION_TIME",
    REDIS_HOST = "REDIS_HOST",
    REDIS_PORT = "REDIS_PORT",
}

type envKeysType = `${envKeys}`;

export function env(key: envKeysType, fallback?: any) {
    const v = process.env[key];
    if (v === undefined && fallback === undefined) {
        throw new Error(`Missing env ${key}`);
    }
    return v ?? fallback!;
}
