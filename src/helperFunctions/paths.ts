import { join, dirname } from 'path';
import * as fs from 'fs';

// CJS already gives you __dirname automatically
const baseDir = process.pkg ? dirname(process.execPath) : join(__dirname, '..', '..');

export const uploads_root = join(baseDir, 'uploads');
export const backup_path = join(baseDir, 'backups');
export const temp_dir = join(baseDir, 'temp');
export const extract_dir = join(baseDir, 'restores');

[uploads_root, backup_path, temp_dir, extract_dir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
