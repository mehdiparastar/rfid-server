import { Body, Controller, Get, Param, ParseArrayPipe, ParseBoolPipe, ParseEnumPipe, ParseIntPipe, Post, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { SerializeRequestsInterceptor } from 'src/interceptors/serialize-requests.interceptor';
import { ScanModeEnum, type ScanMode } from '../enum/scanMode.enum';
import { Esp32WsService } from './esp32-ws.service';

@Controller('jrd')
export class JrdController {
    constructor(
        private readonly espService: Esp32WsService,
    ) { }

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
