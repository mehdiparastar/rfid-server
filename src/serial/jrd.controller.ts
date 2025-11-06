import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Body, Controller, Get, Inject, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { type Cache } from 'cache-manager';
import { SerializeRequestsInterceptor } from 'src/interceptors/serialize-requests.interceptor';
import { ScanModeEnum, type ScanMode } from '../enum/scanMode.enum';
import { InitJrdModuleDto } from './init-jrd-module.dto';
import { JrdHubService } from './jrd-hub.service';
import { IjrdList, JrdService } from './jrd.service';
import { ClearScenarioHistoryDto, StartScenarioDto, StopScenarioDto } from './scenario.dto';
import { LockService } from './lock.service';

@Controller('jrd')
export class JrdController {
    constructor(
        private readonly jrdService: JrdService,
        private readonly hub: JrdHubService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private readonly lock: LockService
    ) { }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Get('devices')
    async list() {
        await this.lock.acquire(); // ⏸ wait if stopScenario is running 

        await this.hub.reDiscoverModules()
        return this.jrdService.listAllConnectedDevice()
    }

    @Get('current-scenario')
    async currentScenario() {
        await this.lock.acquire(); // ⏸ wait if stopScenario is running 

        await this.hub.reDiscoverModules()
        const current = this.jrdService.currentScenario()
        return current
    }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('/modules/re-discover-modules')
    async reDescoverModules() {
        const discover = await this.hub.reDiscoverModules()
        return discover
    }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('/modules/init')
    async initModules(@Body() body: InitJrdModuleDto[]) {
        await this.lock.acquire(); // ⏸ wait if stopScenario is running 

        await this.hub.reDiscoverModules()

        const aliveModules = body.filter(m => this.hub.list().map(el => el.id).includes(m.deviceId))

        const bodyHash = aliveModules.map(x => `${x.deviceId}-${x.isActive}-${x.mode}-${x.power}`).join("_")
        const cacheKey = `modules-init-${bodyHash}`;
        const ttlMiliSeconds = 1000;

        // Get from cache (returns undefined on miss)
        const cacheList = await this.cacheManager.get<IjrdList[]>(cacheKey);
        if (cacheList !== undefined) {
            return cacheList;
        }

        for (const scenario of aliveModules) {
            const { power, mode, deviceId, isActive } = scenario;

            await (this.hub.get(deviceId)).setPower(power < 15 ? 15 : power)

            this.jrdService.moduleInit(deviceId, { power: power, mode: mode, isActive: isActive })

        }
        const list = await this.list()
        await this.cacheManager.set(cacheKey, list, ttlMiliSeconds);

        return list
    }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('/modules/setScanMode')
    async setScanMode(@Body() body: { deviceId: string; mode: ScanMode; }) {
        await this.lock.acquire(); // ⏸ wait if stopScenario is running 

        await this.hub.reDiscoverModules()

        const { mode, deviceId } = body;

        if (this.hub.list().map(el => el.id).includes(deviceId)) {
            this.jrdService.moduleInit(deviceId, { mode: mode, })
        }

        const list = await this.list()
        return list
    }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('/modules/setIsActiveModule')
    async setIsActiveModule(@Body() body: { deviceId: string; isActive: boolean; }) {
        await this.lock.acquire(); // ⏸ wait if stopScenario is running 

        await this.hub.reDiscoverModules()

        const { isActive, deviceId } = body;

        if (this.hub.list().map(el => el.id).includes(deviceId)) {
            this.jrdService.moduleInit(deviceId, { isActive, })
        }
        const list = await this.list()
        return list
    }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('/modules/setModuleScanPower')
    async setModuleScanPower(@Body() body: { deviceId: string; power: number; }) {
        await this.lock.acquire(); // ⏸ wait if stopScenario is running 

        await this.hub.reDiscoverModules()

        const { power, deviceId } = body;

        if (this.hub.list().map(el => el.id).includes(deviceId)) {
            await (this.hub.get(deviceId)).setPower(power < 15 ? 15 : power)
            this.jrdService.moduleInit(deviceId, { power, })
        }
        const list = await this.list()
        return list
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
        this.lock.startStopScenario();
        try {
            const { mode } = body;

            return await this.jrdService.stopScenario(mode)
        } finally {
            this.lock.finishStopScenario(); // ✅ unlock
        }
    }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('/modules/clear-scenario-history')
    @ApiBody({
        description: 'Clear scanned history for a set of devices in provided mode',
        schema: {
            type: 'object',
            properties: {
                mode: { type: 'string', enum: Object.values(ScanModeEnum), example: 'Scan' },
            },
            required: ['mode'],
        },
    })
    async clearScenarioHistory(@Body() body: ClearScenarioHistoryDto) {
        await this.lock.acquire(); // ⏸ wait if stopScenario is running

        const { mode } = body;
        return this.jrdService.clearScenarioHistory(mode)
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
        await this.hub.reDiscoverModules()

        const { ids, mode } = body;

        const validIDs = ids.filter(deviceId => this.hub.list().map(el => el.id).includes(deviceId))

        return this.jrdService.startScenario(validIDs, mode)
    }


    @Get('/modules/scan-results')
    async scanResults(@Query('mode') mode: ScanMode) {
        await this.lock.acquire(); // ⏸ wait if stopScenario is running

        return await this.jrdService.scanResult(mode)
    }






    @Get(':id/ping')
    async ping(@Param('id') id: string) {
        return await (this.hub.get(id)).ping();
    }

    @Get(':id/power')
    async getPower(@Param('id') id: string) {
        const p = await (this.hub.get(id)).getPower();
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
        await (this.hub.get(id)).setPower(dbm);
        return { id, ok: true };
    }

    @Get(':id/info')
    async info(@Param('id') id: string, @Query('type') type: 'hw' | 'sw' | 'mfg' = 'hw') {
        const text = await (this.hub.get(id)).getInfo(type);
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
        await (this.hub.get(id)).stopScan();
        return { id, stopped: true };
    }
}
