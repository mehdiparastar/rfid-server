import { ArrayNotEmpty, IsArray, IsEnum, IsString } from "class-validator";
import { DeviceId } from "./jrd-state.store";
import { type ScanMode, ScanModeEnum } from "./serial.controller";

export class StartScenarioDto {
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    ids!: DeviceId[];

    @IsEnum(ScanModeEnum)
    mode!: ScanMode;
}

export class StopScenarioDto {
    @IsEnum(ScanModeEnum)
    mode!: ScanMode;
}

export class ClearScenarioHistoryDto {
    @IsEnum(ScanModeEnum)
    mode!: ScanMode;
}