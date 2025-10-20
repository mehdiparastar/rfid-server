import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SerialService } from './serial.service';

export type ScanMode = 'Inventory' | 'Scan' | 'NewProduct';

export enum ScanModeEnum {
    Inventory = 'Inventory',
    Scan = 'Scan',
    NewProduct = 'NewProduct',
}

@Controller('serial')
export class SerialController {
    constructor(private readonly serialService: SerialService) { }

    @Get('/modules/power')
    async getPower(@Query('mode') mode: ScanMode) {
        if (!mode) throw new BadRequestException('mode is required');

        const power = await this.serialService.getScannerCurrentPowerDbm(mode)
        return power.length > 0 ? Math.round(power.reduce((p, c) => p + c.percent, 0) / power.length) : -1
    }

    @Get('modules')
    async getModules(@Query('mode') mode: ScanMode) {
        if (!mode) throw new BadRequestException('mode is required');
        return this.serialService.getRFIDPortSpecs(mode)
    }

    @Post('/modules/init')
    async initModules(@Body() body: { power: number; mode: ScanMode }) {
        const { power, mode } = body;
        if (!power || !mode) {
            throw new BadRequestException('power and mode are required');
        }

        const res = await this.serialService.InitScenario(power, mode)
        const updatedModules = res.initingRes.map(item => ({
            ...item,
            powerSetSuccess: !!res.powerSetRes.find(el => el.path === item.path)?.success,
            powerPercent: res.powerSetRes.find(el => el.path === item.path)?.percent,
            powerDbm: res.powerSetRes.find(el => el.path === item.path)?.dbm,
            scanMode: res.scanMode
        }))
        this.serialService.rfidPortSpecs = updatedModules
        return updatedModules
    }

    @Get('/modules/scenario-state')
    getScenarioState() {
        return this.serialService.scenarioState()
    }

    @Post('/modules/scenario/start')
    startScenario(@Query('mode') mode: ScanMode) {
        return this.serialService.startContinuous(mode)
    }

    @Post('/modules/scenario/stop')
    stopScenario() {
        return this.serialService.stopContinuous()
    }

    @Get('/modules/scan-results')
    async scanResults(@Query('mode') mode: ScanMode) {
        return await this.serialService.scanResult(mode)
    }


    // @Post('reinit')
    // @UseGuards(JwtAccessGuard, RolesGuard)
    // @Roles(UserRoles.userFL)
    // reinit() {
    //     return this.serialService.reinitPorts();
    // }
}