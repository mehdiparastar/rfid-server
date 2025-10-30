import { BadRequestException, Controller, Get, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { SerializeRequestsInterceptor } from 'src/interceptors/serialize-requests.interceptor';
import { DbOperationsService } from './db-operations.service';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { User } from 'src/users/entities/user.entity';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

export interface UploadResponse {
    success: boolean;
    message: string;
}

@Controller('db-operations')
export class DbOperationsController {
    constructor(private readonly dbOperationService: DbOperationsService) { }


    @Get('backup-request')
    @UseGuards(JwtAccessGuard)
    @UseInterceptors(SerializeRequestsInterceptor)
    async backup(@CurrentUser() user: Partial<User>) {
        const currentDate = new Date();

        // Get individual date and time components
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are zero-based
        const day = String(currentDate.getDate()).padStart(2, '0');
        const hours = String(currentDate.getHours()).padStart(2, '0');
        const minutes = String(currentDate.getMinutes()).padStart(2, '0');
        const seconds = String(currentDate.getSeconds()).padStart(2, '0');

        // Create the formatted string
        const formattedDateTime = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

        await this.dbOperationService.deleteDirectory(this.dbOperationService.backupPath)

        const dbBackupPath = await this.dbOperationService.backupDB(formattedDateTime, user) as string
        const uploadsBackupPath = await this.dbOperationService.backupUploadsDirectory(formattedDateTime, user) as string

        const zipPath = await this.dbOperationService.zipFiles([dbBackupPath, uploadsBackupPath], this.dbOperationService.backupPath, `BackUp_${formattedDateTime}`)

        await this.dbOperationService.deleteFiles([dbBackupPath, uploadsBackupPath])

        return { url: `/api/db-operations/download?file=${encodeURIComponent(zipPath)}` }
    }

    @Get('download')
    // @UseGuards(AccessTokenGuard, RolesGuard)
    // @Roles(UserRoles.superUser)
    downloadFile(@Query('file') file: string, @Res() res: Response) {
        res.download(file); // Set up the download
    }


    @Post('restore-backup')
    @UseGuards(JwtAccessGuard)
    @UseInterceptors(SerializeRequestsInterceptor)
    @UseInterceptors(FileInterceptor('backupZipFile', { limits: { fileSize: 1 * 1024 * 1024 * 1024 } }))
    async restoreBackup(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: Partial<User>) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        if (!file.originalname.toLowerCase().endsWith('.zip')) {
            throw new BadRequestException('Only ZIP files are allowed');
        }        

        return this.dbOperationService.restoreFromBackup(file);
    }
}
