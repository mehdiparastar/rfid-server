import { ArrayNotEmpty, IsArray, IsEnum, IsString } from "class-validator";
import { type ScanMode, ScanModeEnum } from "src/enum/scanMode.enum";
import { DeviceId } from "./jrd-state.store";

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

export class ScanModeDto {
    @IsEnum(ScanModeEnum)
    mode!: ScanMode;
}