import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Body, Controller, Get, Inject, Param, ParseArrayPipe, ParseBoolPipe, ParseEnumPipe, ParseIntPipe, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { type Cache } from 'cache-manager';
import { SerializeRequestsInterceptor } from 'src/interceptors/serialize-requests.interceptor';
import { ScanModeEnum, type ScanMode } from '../enum/scanMode.enum';
import { Esp32WsService } from './esp32-ws.service';
import { InitJrdModuleDto } from './init-jrd-module.dto';
import { JrdHubService } from './jrd-hub.service';
import { IjrdList, JrdService } from './jrd.service';
import { LockService } from './lock.service';
import { ScanModeDto, StartScenarioDto, StopScenarioDto } from './scenario.dto';

@Controller('jrd')
export class JrdController {
    constructor(
        private readonly jrdService: JrdService,
        private readonly hub: JrdHubService,
        private readonly espService: Esp32WsService,
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
    async clearScenarioHistory(@Body() body: ScanModeDto) {
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




    // ===============================================
    // LIST CONNECTED ESP32 MODULES
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Get('all-connected-esp-modules')
    listConnected(): any {
        return this.espService.listConnected();
    }

    // ===============================================
    // CLEAR SCAN HISTORY BY MODE
    // GET /api/jrd/:mode/clear-scan-history
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Post(':mode/clear-scan-history')
    async clearScanHistory(@Param('mode', new ParseEnumPipe(ScanModeEnum)) mode: ScanMode) {
        const response = this.espService.clearScanHistory(mode);
        return { sent: true, command: 'clearScanHistory', ...response };
    }

    // ===============================================
    // GET CURRENT POWER
    // GET /api/jrd/:id/power
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Get(':id/power')
    async getCurrentPower(@Param('id', ParseIntPipe) id: number) {
        const response = await this.espService.getCurrentPower(id);
        return { sent: true, command: 'getCurrentPower', ...response };
    }

    // ===============================================
    // SET POWER
    // POST /api/jrd/:id/power  { "dbm": 18 }
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
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
    async setPower(
        @Param('id', ParseIntPipe) id: number,
        @Body('dbm', ParseIntPipe) dbm: number
    ) {
        const response = await this.espService.setPower(id, dbm);
        return { sent: true, command: 'setPower', requestedPower: dbm, ...response };
    }

    // ===============================================
    // SET IsActive
    // POST /api/jrd/:id/is-active  { "isActive": false }
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Post(':id/is-active')
    @ApiBody({
        description: 'Activateting module',
        schema: {
            type: 'object',
            properties: {
                isActive: {
                    type: 'boolean',
                    description: 'Activate module with true and false',
                    example: false
                }
            },
            required: ['isActive']
        }
    })
    setIsActive(
        @Param('id', ParseIntPipe) id: number,
        @Body('isActive', ParseBoolPipe) isActive: boolean
    ) {
        this.espService.setIsActive(id, isActive);
        return { sent: true, command: 'setIsActive', isActive };
    }

    // ===============================================
    // SET Mode
    // POST /api/jrd/:id/mode  { "mode": 'Inventory'|'Scan'|'NewProduct' }
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Post(':id/mode')
    @ApiBody({
        description: 'Change module mode to Inventory | Scan | NewProduct',
        schema: {
            type: 'object',
            properties: {
                mode: {
                    type: 'string',
                    enum: Object.values(ScanModeEnum),
                    description: 'Module operating mode',
                    example: ScanModeEnum.Inventory,
                },
            },
            required: ['mode'],
        },
    })
    setMode(
        @Param('id', ParseIntPipe) id: number,
        @Body('mode', new ParseEnumPipe(ScanModeEnum)) mode: ScanMode
    ) {
        this.espService.setMode(id, mode);
        return { sent: true, command: 'setMode', mode };
    }

    // ===============================================
    // START CONTINUOUS SCAN
    // POST /api/jrd/:id/start-scan
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Post(':id/start-scan')
    async startScan(@Param('id', ParseIntPipe) id: number) {
        const res = await this.espService.startScan(id);
        return { sent: true, command: 'startContiniusScan', started: res };
    }

    // ===============================================
    // START CONTINUOUS SCAN BY MODE
    // POST /api/jrd/:mode/start-scan-by-mode
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Post(':mode/start-scan-by-mode')
    async startScanByMode(@Param('mode') mode: ScanMode) {
        const res = await this.espService.startScanByMode(mode);
        return { sent: true, command: 'startContiniusScanByMode', res };
    }

    // ===============================================
    // START CONTINUOUS SCAN BY IDs
    // POST /api/jrd/ids/start-scan-by-ids
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('ids/start-scan-by-ids')
    async startScanByIds(@Body('ids', new ParseArrayPipe({ items: Number, optional: false })) ids: number[]) {
        const res = await this.espService.startScanByIds(ids);
        return { sent: true, command: 'startContiniusScanByIds', res };
    }

    // ===============================================
    // STOP SCAN
    // POST /api/jrd/:id/stop-scan
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Post(':id/stop-scan')
    async stopScan(@Param('id', ParseIntPipe) id: number) {
        const res = await this.espService.stopScan(id);
        return { sent: true, command: 'stopScan', stopped: res };
    }

    // ===============================================
    // STOP SCAN BY MODE
    // POST /api/jrd/:mode/stop-scan-by-mode
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Post(':mode/stop-scan-by-mode')
    async stopScanByMode(@Param('mode') mode: ScanMode) {
        const res = await this.espService.stopScanByMode(mode);
        return { sent: true, command: 'stopScanByMode', res };
    }

    // ===============================================
    // GET MODULE INFO
    // GET /api/jrd/:id/info/:type
    // type:
    //   0 = hardware version
    //   1 = software version
    //   2 = manufacturer
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Get(':id/info/:type')
    @ApiOperation({
        summary: 'Get module information from JRD100',
        description: `Fetch module information from the ESP32 → JRD100 reader.

        **Type values:**
        - \`0\` → Hardware version  
        - \`1\` → Software version  
        - \`2\` → Manufacturer string  
`
    })
    @ApiParam({
        name: 'id',
        type: String,
        description: 'ESP32 module ID (e.g. esp-001)'
    })
    @ApiParam({
        name: 'type',
        type: Number,
        enum: [0, 1, 2],
        description: `Information type:
        - 0 = hardware version  
        - 1 = software version  
        - 2 = manufacturer`
    })
    @ApiResponse({
        status: 200,
        description: 'Command sent successfully',
        schema: {
            example: {
                sent: true,
                command: 'getModuleInfo',
                type: 1
            }
        }
    })
    async getModuleInfo(
        @Param('id', ParseIntPipe) id: number,
        @Param('type', ParseIntPipe) type: number
    ) {
        const res = await this.espService.getModuleInfo(id, type);
        return { sent: true, command: 'getModuleInfo', out: res };
    }

    // ===============================================
    // SET REGION
    // POST /api/jrd/:id/region { "region": 1 }
    // Region values based on protocol:
    // 🇨🇳 China-900: 1
    // 🇨🇳 China-800: 4
    // 🇺🇸 USA: 2
    // 🇪🇺 Europe: 3
    // 🇰🇷 Korea: 6
    // ===============================================
    @UseInterceptors(SerializeRequestsInterceptor)
    @Post(':id/region')
    @ApiOperation({
        summary: 'Set RFID operating region',
        description: `
            Set JRD100 RFID operating region.

            **Valid Protocol Region Codes:**
            - 🇨🇳 China 900 MHz: **1**
            - 🇺🇸 USA: **2**
            - 🇪🇺 Europe: **3**
            - 🇨🇳 China 800 MHz: **4**
            - 🇰🇷 Korea: **6**

            These values must match the MagicRF/JRD100 protocol.
        `,
    })
    @ApiParam({
        name: 'id',
        description: 'ESP32 module ID (example: esp-002)',
        example: 'esp-002',
    })
    @ApiBody({
        description: 'RFID operating region code',
        schema: {
            type: 'object',
            properties: {
                region: {
                    type: 'number',
                    enum: [1, 2, 3, 4, 6],
                    description: 'Region code',
                    example: 1,
                },
            },
            required: ['region'],
        },
    })
    async setRegion(
        @Param('id', ParseIntPipe) id: number,
        @Body('region', ParseIntPipe) region: number
    ) {
        const res = await this.espService.setRegion(id, region);
        return { sent: true, command: 'setRegion', requestedRegion: region, success: res };
    }

    @UseInterceptors(SerializeRequestsInterceptor)
    @Post('inventory-item-should-be-scanned')
    async getInventoryItemShouldBeScanned(@Body('epcList') epcList: string[]) {
        return this.espService.getInventoryItemShouldBeScanned(epcList)
    }
}
