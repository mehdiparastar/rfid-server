import crypto from "crypto";
import fs from "fs";

const password = process.argv[2]; // e.g. node encrypt-env.js mySecretKey
if (!password) throw new Error("Usage: node encrypt-env.js <password>");

const algorithm = "aes-256-cbc";
const iv = crypto.randomBytes(16);
const key = crypto.createHash("sha256").update(password).digest();

const envData = fs.readFileSync(".env.production", "utf8");
const cipher = crypto.createCipheriv(algorithm, key, iv);
let encrypted = cipher.update(envData, "utf8", "base64");
encrypted += cipher.final("base64");

const output = iv.toString("base64") + ":" + encrypted;
fs.writeFileSync(".env.production.enc", output);

console.log("✅ Encrypted .env written to .env.production.enc");
