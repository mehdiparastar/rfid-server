// src/config/env.ts
import * as path from "path";
import { config } from "dotenv";
import * as fs from "fs";
import * as crypto from "crypto";
import { parse } from "dotenv";

export function loadEnv() {
    // Detect if running inside a pkg executable
    const isPkg = !!process.pkg;
    console.log(`You are in ${isPkg ? ".exe" : "base"} mode.`)
    if (!isPkg) {
        console.log("starting server on path: ", process.cwd(), ` in '${process.env.NODE_ENV}' environment.`)
        const nodeEnv = process.env.NODE_ENV || "development"; // "development" | "production" | "test"
        const file = `.env.${nodeEnv}`;
        config({ path: path.resolve(process.cwd(), file) });
    }
    else {
        // Determine base directory
        const basePath = path.dirname(process.execPath)

        // Ensure NODE_ENV has a fallback
        const nodeEnv = "production";
        const envEncPath = path.join(basePath, `.env.${nodeEnv}.enc`);

        if (!fs.existsSync(envEncPath)) {
            console.error(`❌ Encrypted env file not found: ${envEncPath}`);
            return;
        }

        // 🔑 Get password from external source (user input, license key, or OS env)
        const password = "mehdip@r@st@r70";

        const algorithm = "aes-256-cbc";
        const [ivBase64, dataBase64] = fs.readFileSync(envEncPath, "utf8").split(":");
        const iv = Buffer.from(ivBase64, "base64");
        const key = crypto.createHash("sha256").update(password).digest();

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(dataBase64, "base64", "utf8");
        decrypted += decipher.final("utf8");

        // Parse into an object (no file)
        const parsed = parse(decrypted); // from dotenv

        // Apply into process.env carefully (avoid clobbering)
        for (const [k, v] of Object.entries(parsed)) {
            if (process.env[k] === undefined) {
                process.env[k] = v;
            }
        }

        // Overwrite and zero sensitive buffers where possible
        // (best-effort; V8 may still have copies in memory)
        decrypted = decrypted.replace(/./g, "\0");
        // no reliable way to zero Buffer.from string copies created internally by parsing,
        // but we at least clear local variables and try to allow GC:
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _tmp = null;
    }
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
    JRD_DEVICES = "JRD_DEVICES",
}

type envKeysType = `${envKeys}`;

export function env(key: envKeysType, fallback?: any) {
    const v = process.env[key];
    if (v === undefined && fallback === undefined) {
        throw new Error(`Missing env ${key}`);
    }
    return v ?? fallback!;
}
