// init-module.dto.ts
import { IsBoolean, IsEnum, IsInt, IsString, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { type ScanMode, ScanModeEnum } from './serial.controller';

export class InitJrdModuleDto {
    @ApiProperty({ example: 26, description: 'TX power (dBm), device-specific range' })
    @IsInt()
    @Min(1)       // adjust to your real limits
    @Max(26)      // adjust to your real limits
    power!: number;

    @ApiProperty({ enum: ScanModeEnum, example: ScanModeEnum.Inventory })
    @IsEnum(ScanModeEnum)
    mode!: ScanMode;

    @ApiProperty({ example: 'com7' })
    @IsString()
    deviceId!: string;

    @ApiProperty({ example: true })
    @IsBoolean()
    isActive!: boolean;
}
