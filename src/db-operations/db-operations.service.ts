import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import archiver from 'archiver';
import { exec, execSync, spawn } from 'child_process';
import * as fs from 'fs';
import { rm } from 'fs/promises';
import * as path from 'path';
import { env } from 'src/config/env';
import { SocketGateway } from 'src/socket/socket.gateway';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class DbOperationsService {
    private readonly logger = new Logger(DbOperationsService.name);
    public backupPath: string;
    private readonly tempDir: string
    private readonly extractDir: string

    constructor(
        private readonly socketGateway: SocketGateway,
    ) {
        this.backupPath = path.join(process.cwd(), 'backups');
        this.tempDir = path.join(process.cwd(), 'temp');
        this.extractDir = path.join(process.cwd(), 'restores');
    }


    getDatabaseSize() {
        try {
            const command = `mysql -h ${env("MYSQL_ROOT_HOST")} -u ${env("MYSQL_USER")} --password=${env("MYSQL_PASSWORD")} -e "SELECT table_schema AS database_name, ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb FROM information_schema.tables WHERE table_schema = '${env("MYSQL_DATABASE")}' GROUP BY table_schema;"`;

            const output = execSync(command, { encoding: 'utf-8' });

            // Extracting the size from the output
            const match = output.match(/(\d+\.\d+)/); // Extract first number found
            if (match) {
                this.logger.log(`Estimated database size: ${match[1]} MB`);
                return parseFloat(match[1]);
            } else {
                this.logger.log('Could not determine database size.');
                return null;
            }
        } catch (error) {
            this.logger.error('Error fetching database size:', error.message);
            return null;
        }
    }

    getFileSize(filePath: string, callback: (err: NodeJS.ErrnoException | null, size?: number) => void): void {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                callback(err);
                return;
            }
            callback(null, stats.size);
        });
    }

    getDirectorySize(dirPath: string): number | null {
        try {
            const output = execSync(`du -sb "${dirPath}"`, { encoding: 'utf-8' });
            const sizeInBytes = parseInt(output.trim().split('\t')[0], 10);
            return sizeInBytes / (1024 * 1024); // Return size in MB
        } catch (error) {
            this.logger.error('Error getting directory size:', error.message);
            return null;
        }
    }

    async backupDB(formattedDateTime: string, user: Partial<User>) {
        return new Promise((resolve, reject) => {
            this.socketGateway.emitBackUpProgress(`backup_db`, 0, user)

            // Create the backups directory if it doesn't exist
            if (!fs.existsSync(this.backupPath)) {
                fs.mkdirSync(this.backupPath);
            }

            const backupDBSize = this.getDatabaseSize();

            const filePath = path.join(
                this.backupPath,
                `${formattedDateTime}.sql`,
            );

            const command = `mysqldump -h ${env("MYSQL_ROOT_HOST")} -u ${env("MYSQL_USER")} --password=${env("MYSQL_PASSWORD")} --no-tablespaces --routines --events ${env("MYSQL_DATABASE")} > ${filePath}`;

            const interval = setInterval(() => {
                this.getFileSize(filePath, (err, size) => {
                    if (err) {
                        this.logger.error('Error getting file size:', err);
                        return;
                    }
                    if (size && backupDBSize) {
                        this.logger.log(`File size: ${size / (1024 * 1024)} MB`, backupDBSize);
                        this.socketGateway.emitBackUpProgress(`backup_db`, Math.round((size / (1024 * 1024)) / (backupDBSize * 1.2) * 10), user);
                    }
                });
            }, 1000);

            const run = exec(command);


            run.stderr && run.stderr.on('data', (data) => {
                if (!data.includes('mysqldump: [Warning] Using a password on the command line interface can be insecure.')) {
                    this.logger.error(`Backup stderr: ${data}`);
                    reject(new InternalServerErrorException(data || "Backup failed."))
                }
            });

            run.stdout && run.stdout.on('data', (data) => {
                // Simulate progress reporting
                this.socketGateway.emitBackUpProgress('backup_db', 1, user);
            });

            run.on('exit', (code) => {
                if (code !== 0) {
                    clearInterval(interval)
                    reject(new InternalServerErrorException(`Backup failed. Error code is: ${code}`))
                } else {
                    clearInterval(interval)
                    this.socketGateway.emitBackUpProgress(`backup_db`, 100, user)

                    resolve(filePath)
                    // resolve({ url: `/db-operations/download?file=${encodeURIComponent(filePath)}` });
                }
            });
        })
    }

    async backupUploadsDirectory(formattedDateTime: string, user: Partial<User>) {
        return new Promise((resolve, reject) => {
            this.socketGateway.emitBackUpProgress(`backup_files`, 0, user);

            // Create the backups directory if it doesn't exist
            if (!fs.existsSync(this.backupPath)) {
                fs.mkdirSync(this.backupPath);
            }

            const uploadsPath = path.join(process.cwd(), 'uploads');
            if (!fs.existsSync(uploadsPath)) {
                reject(new InternalServerErrorException('Uploads directory does not exist.'));
                return;
            }

            const uploadSize = this.getDirectorySize(uploadsPath) ?? 0;

            const zipPath = path.join(this.backupPath, `${formattedDateTime}_uploads.zip`);

            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Compression level
            });

            output.on('close', () => {
                this.logger.log(`${archive.pointer()} total bytes`);
                this.logger.log(`archiver has been finalized and the output stream closed.`);
                this.socketGateway.emitBackUpProgress(`backup_files`, 100, user);
                resolve(zipPath)
                // resolve({ url: `/db-operations/download?file=${encodeURIComponent(zipPath)}` });
            });

            archive.on('progress', (data) => {
                if (uploadSize > 0) {
                    const progress = Math.round((data.fs.processedBytes / (uploadSize * 1024 * 1024)) * 100);
                    this.logger.log(`Progress: ${progress}% (processed: ${data.fs.processedBytes} bytes)`);
                    this.socketGateway.emitBackUpProgress(`backup_files`, Math.min(progress, 100), user);
                }
            });

            archive.on('error', (err) => {
                this.logger.error('Archive error:', err);
                reject(new InternalServerErrorException(`Archiving failed: ${err.message}`));
            });

            archive.pipe(output);

            archive.directory(uploadsPath, false);

            archive.finalize();
        });
    }

    async zipFiles(filePaths: string[], outputDir: string, zipName: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const zipPath = path.join(outputDir, `${zipName}.zip`);

            // Create output directory if it doesn't exist
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Compression level
            });

            output.on('close', () => {
                this.logger.log(`Zip created: ${zipPath} (${archive.pointer()} total bytes)`);
                resolve(zipPath);
            });

            archive.on('error', (err) => {
                this.logger.error('Archive error:', err);
                reject(new InternalServerErrorException(`Zipping failed: ${err.message}`));
            });

            archive.pipe(output);

            // Add each file or directory to the archive
            for (const filePath of filePaths) {
                if (!fs.existsSync(filePath)) {
                    this.logger.warn(`Skipping non-existent path: ${filePath}`);
                    continue;
                }

                const stat = fs.statSync(filePath);
                if (stat.isFile()) {
                    archive.file(filePath, { name: path.basename(filePath) });
                } else if (stat.isDirectory()) {
                    archive.directory(filePath, false); // false preserves directory structure
                }
            }

            archive.finalize();
        });
    }

    async deleteFiles(filePaths: string[]): Promise<{ deleted: number; failed: string[] }> {
        const failed: string[] = [];
        const results = await Promise.all(
            filePaths.map(async (filePath: string): Promise<boolean> => {
                try {
                    if (!fs.existsSync(filePath)) {
                        this.logger.warn(`File does not exist, skipping: ${filePath}`);
                        failed.push(filePath);
                        return false;
                    }

                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) {
                        // For directories, use recursive remove (Node.js 14+)
                        await fs.promises.rm(filePath, { recursive: true, force: true });
                        this.logger.log(`Directory removed: ${filePath}`);
                    } else {
                        await fs.promises.unlink(filePath);
                        this.logger.log(`File removed: ${filePath}`);
                    }
                    return true;
                } catch (error) {
                    this.logger.error(`Failed to remove ${filePath}: ${error.message}`);
                    failed.push(filePath);
                    return false;
                }
            })
        );

        const deleted = results.filter(Boolean).length;
        if (failed.length > 0) {
            this.logger.warn(`Deletion summary: ${deleted} deleted, ${failed.length} failed`);
        } else {
            this.logger.log(`All ${deleted} files/directories deleted successfully`);
        }

        return { deleted, failed };
    }


    async deleteDirectory(dirPath: string): Promise<void> {
        try {
            await rm(dirPath, { recursive: true, force: true });
            this.logger.log(`Directory ${dirPath} deleted successfully`);
        } catch (error) {
            this.logger.error(`Error deleting directory ${dirPath}:`, error);
            throw error;
        }
    }

    async restoreFromBackup(file: Express.Multer.File, user: Partial<User>) {
        const safeFilename = `${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const tempZipPath = path.join(this.tempDir, safeFilename);
        const extractPath = path.join(this.extractDir, safeFilename.replace('.zip', ''));

        await this.deleteDirectory(this.tempDir)
        await this.deleteDirectory(this.extractDir)

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir);
        }

        if (!fs.existsSync(this.extractDir)) {
            fs.mkdirSync(this.extractDir);
        }

        try {
            this.logger.log(`Starting restore from backup: ${file.originalname}`);

            // Write ZIP buffer to temp file (for large files, but since multer memory, it's in buffer)
            fs.writeFileSync(tempZipPath, file.buffer);

            // Extract ZIP
            const zip = new AdmZip(tempZipPath);
            zip.extractAllTo(extractPath, true); // true to overwrite

            this.logger.log(`Extracted backup to: ${extractPath}`);

            const sqlFileName = file.originalname.replace("BackUp_", "").replace("zip", "sql")
            const sqlFilePath = path.join(extractPath, sqlFileName);

            let dbRestoringRes = {
                success: false,
                message: 'Database backup not restored.',
            }

            if (fs.existsSync(sqlFilePath)) {
                const totalSize = fs.statSync(sqlFilePath).size;
                let bytesRead = 0;
                let lastEmittedProgress = 0; // To throttle emissions (e.g., every 5%)

                const restoredDB = await new Promise((resolve, reject) => {
                    this.socketGateway.emitRestoreDBProgress("restore_db", 0, user);

                    const mysqlArgs = [
                        '-h', env("MYSQL_ROOT_HOST"),
                        '-u', env("MYSQL_USER"),
                        '--password=' + env("MYSQL_PASSWORD"),
                        env("MYSQL_DATABASE")
                    ];

                    const mysql = spawn('mysql', mysqlArgs);

                    // Handle stdout (optional: log SQL output if needed)
                    mysql.stdout.on('data', (data) => {
                        this.logger.log(`MySQL stdout: ${data}`);
                    });

                    // Handle stderr
                    mysql.stderr.on('data', (data) => {
                        const stderrStr = data.toString();
                        if (!stderrStr.includes('mysql: [Warning] Using a password on the command line interface can be insecure.')) {
                            this.logger.error(`Restore stderr: ${stderrStr}`);
                            reject(new InternalServerErrorException(stderrStr || "Restore failed."));
                        }
                    });

                    // Handle process errors
                    mysql.on('error', (err) => {
                        this.logger.error('MySQL spawn error:', err);
                        reject(new InternalServerErrorException(`Restore failed: ${err.message}`));
                    });

                    // Create read stream for the SQL file
                    const stream = fs.createReadStream(sqlFilePath);

                    // Monitor data chunks for progress
                    stream.on('data', (chunk) => {
                        bytesRead += chunk.length;
                        const progress = Math.round((bytesRead / totalSize) * 100);

                        // Throttle emissions to avoid spamming the client (e.g., update every 5%)
                        if (progress - lastEmittedProgress >= 5 || progress === 100) {
                            this.socketGateway.emitRestoreDBProgress("restore_db", progress, user);
                            lastEmittedProgress = progress;
                        }
                    });

                    // Handle stream errors
                    stream.on('error', (err) => {
                        this.logger.error('Stream error:', err);
                        mysql.kill(); // Kill the MySQL process if stream fails
                        reject(new InternalServerErrorException(`Restore failed: ${err.message}`));
                    });

                    // Pipe the stream to MySQL stdin
                    stream.pipe(mysql.stdin);

                    // Handle process close
                    mysql.on('close', (code) => {
                        if (code !== 0) {
                            reject(new InternalServerErrorException(`Restore failed. Error code is: ${code}`));
                        } else {
                            // Ensure 100% is emitted if not already
                            if (lastEmittedProgress < 100) {
                                this.socketGateway.emitRestoreDBProgress("restore_db", 100, user);
                            }
                            resolve(1);
                        }
                    });
                });

                // Clean up temp ZIP (keep extracted for audit/logs)
                fs.unlinkSync(tempZipPath);

                dbRestoringRes = {
                    success: restoredDB === 1 ? true : false,
                    message: 'Database backup restored successfully',
                };

            } else {
                this.logger.warn(`No ${sqlFileName} found in extracted ZIP.`);
            }

            if (dbRestoringRes.success) {
                this.socketGateway.emitRestoreDBProgress("restore_files", 0, user)
                const dbFilesZipFileName = file.originalname.replace("BackUp_", "").replace(".zip", "_uploads.zip")
                const dbFilesZipFilePath = path.join(extractPath, dbFilesZipFileName)
                const zip = new AdmZip(dbFilesZipFilePath);

                const uploadsPath = path.join(process.cwd(), 'uploads');
                await this.deleteDirectory(uploadsPath)

                const entries = zip.getEntries();
                const fileEntries = entries.filter((entry: any) => !entry.isDirectory); // Only files for extraction & progress
                const totalFiles = fileEntries.length;
                let extractedCount = 0;
                let lastEmittedProgress = 0;
                const progressThreshold = 5;

                for (const fileEntry of fileEntries) { // Loop only over files
                    // FIXED: targetPath is ALWAYS the base dir; maintain=true recreates ZIP structure
                    zip.extractEntryTo(fileEntry.entryName, uploadsPath, true, true); // entryName (string), base dir, maintain=true, overwrite=true

                    extractedCount++;
                    const currentProgress = Math.round((extractedCount / totalFiles) * 100);

                    if (currentProgress >= lastEmittedProgress + progressThreshold || currentProgress === 100) {
                        this.socketGateway.emitRestoreDBProgress('restore_files', currentProgress, user);
                        lastEmittedProgress = currentProgress;
                    }
                }

                // zip.extractAllTo(uploadsPath, true); // true to overwrite

                await this.deleteDirectory(this.extractDir)
                await this.deleteDirectory(this.tempDir)
                this.socketGateway.emitRestoreDBProgress("restore_files", 100, user)
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            return {
                dbRestoringRes
            };

        } catch (error) {
            this.logger.error(`Restore failed: ${error.message}`, error.stack);
            // Clean up on error
            if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
            if (fs.existsSync(extractPath)) {
                // Recursively delete extract dir
                fs.rmSync(extractPath, { recursive: true, force: true });
            }
            throw new BadRequestException(`Restore failed: ${error.message}`);
        }
    }
}
