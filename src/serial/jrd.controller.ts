import { Controller, Get, Post, Body, Param, Query, BadRequestException, UseInterceptors } from '@nestjs/common';
import { JrdHubService } from './jrd-hub.service';
import { ApiBody } from '@nestjs/swagger';
import { ScanModeEnum, type ScanMode } from './serial.controller';
import { DeviceId } from './jrd-state.store';
import { JrdService } from './jrd.service';
import { SerializeRequestsInterceptor } from 'src/interceptors/serialize-requests.interceptor';
import { InitJrdModuleDto } from './init-jrd-module.dto';
import { StartScenarioDto, StopScenarioDto } from './scenario.dto';

@Controller('jrd')
export class JrdController {
    constructor(
        private readonly jrdService: JrdService,
        private readonly hub: JrdHubService
    ) { }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Get('devices')
    async list() {
        return this.jrdService.listAllConnectedDevice()
    }

    @Get('current-scenario')
    async currentScenario() {
        return this.jrdService.currentScenario()
    }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('/modules/init')
    async initModules(@Body() body: InitJrdModuleDto[]) {
        for (const scenario of body) {
            const { power, mode, deviceId, isActive } = scenario;

            await this.hub.get(deviceId).setPower(power < 15 ? 15 : power)

            this.jrdService.moduleInit(deviceId, { power: power, mode: mode, isActive: isActive })

        }
        return await this.list()
    }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('/modules/stop-scenario')
    @ApiBody({
        description: 'Stop scan for a set of devices and set their mode',
        schema: {
            type: 'object',
            properties: {
                mode: { type: 'string', enum: Object.values(ScanModeEnum), example: 'Scan' },
            },
            required: ['mode'],
        },
    })
    async stopScenario(@Body() body: StopScenarioDto) {
        const { mode } = body;

        return this.jrdService.stopScenario(mode)
    }


    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('/modules/start-scenario')
    @ApiBody({
        description: 'Start scan for a set of devices and set their mode',
        schema: {
            type: 'object',
            properties: {
                ids: { type: 'array', items: { type: 'string' }, example: ['com7', 'com8'] },
                mode: { type: 'string', enum: Object.values(ScanModeEnum), example: 'Scan' },
            },
            required: ['ids', 'mode'],
        },
    })
    async startScenario(@Body() body: StartScenarioDto) {
        const { ids, mode } = body;

        return this.jrdService.startScenario(ids, mode)
    }


    @Get('/modules/scan-results')
    async scanResults(@Query('mode') mode: ScanMode) {
        return await this.jrdService.scanResult(mode)
    }




    @Get(':id/ping')
    async ping(@Param('id') id: string) { return await this.hub.get(id).ping(); }

    @Get(':id/power')
    async getPower(@Param('id') id: string) {
        const p = await this.hub.get(id).getPower();
        return { id, power_dbm: p };
    }

    @Post(':id/power')
    @ApiBody({
        description: 'Power level in dBm',
        schema: {
            type: 'object',
            properties: {
                dbm: {
                    type: 'number',
                    description: 'Power level in dBm between 15 - 26',
                    example: 20
                }
            },
            required: ['dbm']
        }
    })
    async setPower(@Param('id') id: string, @Body('dbm') dbm: number) {
        await this.hub.get(id).setPower(dbm);
        return { id, ok: true };
    }

    @Get(':id/info')
    async info(@Param('id') id: string, @Query('type') type: 'hw' | 'sw' | 'mfg' = 'hw') {
        const text = await this.hub.get(id).getInfo(type);
        return { id, type, text };
    }

    @Post(':id/scan/start')
    async start(@Param('id') id: string) {
        const dev = this.hub.get(id);
        await dev.startScan();
        // (subscribe once at app startup in a gateway/service to avoid duplicate logs)
        return { id, started: true };
    }

    @Post(':id/scan/stop')
    async stop(@Param('id') id: string) {
        await this.hub.get(id).stopScan();
        return { id, stopped: true };
    }
}
