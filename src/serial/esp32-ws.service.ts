import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ScanMode } from 'src/enum/scanMode.enum';
import { Product } from 'src/products/entities/product.entity';
import { ProductsService } from 'src/products/products.service';
import { SocketGateway } from 'src/socket/socket.gateway';
import { WebSocket, WebSocketServer } from 'ws';

interface Esp32StatusPayload {
    rssi?: number;
    ip?: string;
    batteryVoltage?: number;
    timestamp?: number; // epoch milliseconds
}
export type ProductScan = Partial<Product> & { scantimestamp: number, scanRSSI: number }
export type ESPModulesTagScanResults = Record<ScanMode, ProductScan[]>;
export interface Esp32ClientInfo {
    id?: number;
    ip?: string;
    socket: WebSocket;
    lastSeen: number;
    mode: ScanMode;
    currentHardPower: number; // in dbm ben 15 and 26
    currentSoftPower: number; // enable if request power be less than 15
    isActive: boolean;
    isScan: boolean;
    tagScanResults: ESPModulesTagScanResults;
    status?: Esp32StatusPayload;
}

@Injectable()
export class Esp32WsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(Esp32WsService.name);
    private wss: WebSocketServer;
    private clients = new Map<number, Esp32ClientInfo>();
    private heartbeatInterval: NodeJS.Timeout;
    private pendingResponses = new Map<
        number, // esp32 id
        {
            resolve: (data: any) => void,
            reject: (err: any) => void,
            timeout: NodeJS.Timeout,
        }
    >();

    constructor(
        private readonly socketGateway: SocketGateway,
        private readonly productService: ProductsService,
    ) { }

    onModuleInit() {
        this.wss = new WebSocketServer({
            port: 1253,
            host: '0.0.0.0',
            path: '/jrd100'
        });

        this.logger.log(`ESP32 WebSocket listening on ws://0.0.0.0:1253/jrd100`);

        this.wss.on('connection', (socket, req) => {
            const ip = req.socket.remoteAddress;
            const clientInfo: Esp32ClientInfo = {
                socket,
                ip,
                mode: 'Inventory',
                isActive: false,
                isScan: false,
                currentHardPower: 26,
                currentSoftPower: 15,
                tagScanResults: { Inventory: [], NewProduct: [], Scan: [] },
                lastSeen: Date.now(),
            };

            this.logger.log(`ESP32 connected from ${ip}`);

            socket.on('message', (data) => {
                try {
                    const buf = Array.isArray(data)
                        ? Buffer.concat(data)
                        : Buffer.isBuffer(data)
                            ? data
                            : Buffer.from(new Uint8Array(data as ArrayBuffer));

                    const len = buf.length;

                    clientInfo.lastSeen = Date.now();  // this is mandatory.

                    // 1) Hello Message
                    if (len === 2 && buf[0] === 0xFF) {
                        const id = buf[1];
                        clientInfo.id = id
                        this.clients.set(id, clientInfo);
                        this.socketGateway.emitUpdateRegistrationStatus(this.clients);
                        this.logger.log(`ESP registered id=${id} from ${ip}`);
                        return;
                    }

                    // 2) HEARTBEAT
                    if (len === 1) {
                        // const id = buf[0];
                        // nothing required , at top lastSeen updated
                        return;
                    }

                    // 3) BATTERY
                    if (len === 3 && buf[0] === 0xDD) {
                        const voltage = buf[2] / 10;

                        this.logger.debug(`Battery event received: ${voltage}V`);

                        if (!clientInfo.status) {
                            clientInfo.status = {};
                        }

                        clientInfo.status.batteryVoltage = voltage;
                        this.socketGateway.emitUpdateESPModulesStatus(clientInfo);
                        return

                    }

                    // 4) WIFI
                    if (len === 3 && buf[0] === 0xEE) {
                        const wifiRSSI = buf.readInt8(2);

                        this.logger.debug(`WIFI event received: ${wifiRSSI} dbm`);

                        if (!clientInfo.status) {
                            clientInfo.status = {};
                        }

                        clientInfo.status.rssi = wifiRSSI;
                        this.socketGateway.emitUpdateESPModulesStatus(clientInfo);
                        return;
                    }

                    // 5) Commands
                    if (buf[0] === 0xBB && buf[1] === 0x01 && buf[2] !== 0xFF && clientInfo.id) {
                        const pending = this.pendingResponses.get(clientInfo.id);

                        switch (buf[2]) {
                            case 0xB7: // getPower CMD

                                if (pending) {
                                    clearTimeout(pending.timeout);
                                    this.pendingResponses.delete(clientInfo.id);

                                    const msb = buf[5];
                                    const lsb = buf[6];
                                    const powerValue = (msb << 8) | lsb;
                                    const dbm = powerValue / 100;

                                    pending.resolve(dbm);
                                    clientInfo.currentHardPower = dbm
                                    return;
                                }

                                break;
                            case 0xB6: // setPower CMD

                                if (pending) {
                                    clearTimeout(pending.timeout);
                                    this.pendingResponses.delete(clientInfo.id);

                                    const status = buf[5];
                                    const ok = status === 0x00;

                                    pending.resolve(ok);

                                    return;
                                }
                            case 0x27: // startScan CMD

                                if (pending) {
                                    clearTimeout(pending.timeout);
                                    this.pendingResponses.delete(clientInfo.id);

                                    const status = buf[5];
                                    const ok = status === 0x00;

                                    pending.resolve(ok);
                                    clientInfo.isScan = ok
                                    return;
                                }
                            case 0x28: // stopScan CMD

                                if (pending) {
                                    clearTimeout(pending.timeout);
                                    this.pendingResponses.delete(clientInfo.id);

                                    const status = buf[5];
                                    const ok = status === 0x00;
                                    clientInfo.isScan = !ok
                                    pending.resolve(ok);

                                    return;
                                }
                            case 0x07: // setRegion CMD

                                if (pending) {
                                    clearTimeout(pending.timeout);
                                    this.pendingResponses.delete(clientInfo.id);

                                    const status = buf[5];
                                    const ok = status === 0x00;

                                    pending.resolve(ok);

                                    return;
                                }
                            case 0x03: // getModuleInfo CMD

                                if (pending) {
                                    clearTimeout(pending.timeout);
                                    this.pendingResponses.delete(clientInfo.id);

                                    if (buf.length < 8) {
                                        pending.reject(new Error('ModuleInfo response too short'));
                                        break;
                                    }

                                    const pl = (buf[3] << 8) | buf[4];
                                    if (pl < 1) {
                                        pending.reject(new Error(`ModuleInfo PL invalid: ${pl}`));
                                        break;
                                    }

                                    const payloadStart = 5;
                                    const payloadEnd = 5 + pl; // until before checksum
                                    const asciiBytes = buf.subarray(payloadStart + 1, payloadEnd);

                                    const infoString = asciiBytes.toString('ascii'); // decode

                                    pending.resolve(infoString);


                                    return;
                                }

                                break;
                            default:
                                break;
                        }
                    }


                    // 7) SCAN EVENT
                    if (len > 7 && buf[1] === 0x02) {
                        if (clientInfo.isActive && clientInfo.isScan) {
                            // Step 1 — checksum ultra-fast validation
                            if (!this.validateChecksum(buf, len)) {
                                // corrupted frame – ignore it
                                this.logger.error(`invalidated checksum: ${buf.toString('hex')}`)
                                return null;
                            }

                            // Step 2 — parse
                            const pl = (buf[3] << 8) | buf[4];

                            // offsets
                            const rssi = (buf[5] & 0x80) ? buf[5] - 256 : buf[5]; // signed

                            const pc = (buf[6] << 8) | buf[7];

                            const epcLen = pl - 5; // RSSI(1) + PC(2) + CRC(2)
                            const epcStart = 8;
                            const epcEnd = epcStart + epcLen;

                            // ultra fast EPC extraction: NO Buffer.toString('hex') inside loop
                            let epc = "";
                            for (let i = epcStart; i < epcEnd; i++) {
                                epc += buf[i].toString(16).padStart(2, "0");
                            }

                            const crc = (buf[epcEnd] << 8) | buf[epcEnd + 1];
                            this.socketGateway.emitESPModulesScanResult(
                                clientInfo.id!,
                                epc,
                                rssi,
                                clientInfo.lastSeen,
                                clientInfo.mode,
                                clientInfo.currentHardPower,
                                clientInfo.currentSoftPower,
                                clientInfo.tagScanResults[clientInfo.mode],
                                this.clients,
                            );
                            return
                        } else {
                            this.stopScan(clientInfo.id!)
                        }
                    }
                } catch (err) {
                    this.logger.error(`Invalid ESP message: ${err}`);
                }
            });

            socket.on('close', () => {
                this.logger.log(`ESP32 disconnected: ${ip}`);

                for (const [id, c] of this.clients.entries()) {
                    if (c.socket === socket) {
                        this.clients.delete(id);
                        this.logger.log(`Removed ESP id=${id}`);
                        break;
                    }
                }

                this.socketGateway.emitUpdateRegistrationStatus(this.clients);
            });
        });

        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();

            for (const [id, client] of this.clients.entries()) {
                if (now - client.lastSeen > 6000) { // 6 seconds no heartbeat
                    this.logger.warn(`ESP ${id} is OFFLINE (no heartbeat)`);

                    // Close socket if still open
                    try { client.socket.close(); } catch { }

                    // Remove from map
                    this.clients.delete(id);

                    this.socketGateway.emitUpdateRegistrationStatus(this.clients)

                    // TODO: emit event to frontend if needed
                }
            }
        }, 3000); // check every 5 seconds
    }

    onModuleDestroy() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.wss?.close();
    }


    // Ultra optimized checksum validation for MagicRF/JRD100
    private validateChecksum(buf: Buffer, len: number): boolean {
        let sum = 0;

        // sum TYPE (buf[1]) to LAST-PAYLOAD (buf[len - 3])
        // MUCH faster than reduce()
        for (let i = 1; i < len - 2; i++) {
            sum += buf[i];
        }

        return (sum & 0xFF) === buf[len - 2];
    }

    // ==========================================================
    //  SEND COMMAND TO ESP32 (protocol v1 with reqId)
    // ==========================================================
    private sendCommandToEsp(id: number, cmdHEX: Buffer) {
        const client = this.clients.get(id);
        if (!client) {
            this.logger.warn(`ESP with id=${id} not connected`);
            return;
        }
        if (client.socket.readyState !== WebSocket.OPEN) {
            this.logger.warn(`ESP socket not open for id=${id}`);
            return;
        }

        this.logger.log(`→ CMD ${cmdHEX.toString("hex").toUpperCase()} to module ${id} sent.`);
        client.socket.send(cmdHEX);
    }
    private sendRequestPromisify(id: number, cmd: Buffer): Promise<any> {
        return new Promise((resolve, reject) => {
            const client = this.clients.get(id);
            if (!client) return reject(`Client ${id} not connected`);

            // اگر درخواست قبلی هنوز جواب نگرفته
            if (this.pendingResponses.has(id)) {
                return reject(`ESP ${id} already has a pending request`);
            }

            // 6s timeout
            const timeout = setTimeout(() => {
                this.pendingResponses.delete(id);
                reject(`Timeout waiting for response from ESP ${id}`);
            }, 6000);

            this.pendingResponses.set(id, { resolve, reject, timeout });

            this.sendCommandToEsp(id, cmd);
        });
    }


    // ==========================================================
    //  HIGH-LEVEL COMMANDS
    // ==========================================================
    async getCurrentPower(id: number) {
        try {
            const currentHardPower = await this.sendRequestPromisify(id, Buffer.from([0xB1])) as number
            const client = this.clients.get(id);
            if (client) {
                return ({ currentSoftPower: client.currentSoftPower, currentHardPower })
            }
            return { currentSoftPower: -1, currentHardPower: -1, }
        } catch (ex) {
            return { currentSoftPower: -1, currentHardPower: -1, }
        }
    }

    async setPower(id: number, dbm: number) {
        try {
            const setResponse = await this.sendRequestPromisify(id, Buffer.from([0xB2, dbm])) as boolean
            if (setResponse) {
                const currentPower = await this.getCurrentPower(id)
                const client = this.clients.get(id);
                if (client) {
                    if (dbm < 15) {
                        client.currentSoftPower = dbm;
                    } else {
                        client.currentSoftPower = 15
                    }
                    client.currentHardPower = currentPower.currentHardPower
                    this.socketGateway.emitUpdateESPModulesPower(
                        client.id!,
                        client.currentHardPower,
                        client.currentSoftPower,
                    );
                    return ({ currentSoftPower: client.currentSoftPower, currentHardPower: client.currentHardPower })
                }
            }
            return { currentSoftPower: -1, currentHardPower: -1, }
        } catch (ex) {
            return { currentSoftPower: -1, currentHardPower: -1, }
        }
    }

    setIsActive(id: number, isActive: boolean) {
        const client = this.clients.get(id);
        if (client) {
            client.isActive = isActive;
            this.socketGateway.emitUpdateESPModulesIsActive(id, isActive)
        }
    }

    setMode(id: number, mode: ScanMode) {
        const client = this.clients.get(id);
        if (client) {
            client.mode = mode;
            this.socketGateway.emitUpdateESPModulesMode(id, mode)
        }
    }

    async startScan(id: number): Promise<boolean> {
        try {
            const client = this.clients.get(id)
            if (client && client.isActive) {
                const res = await this.sendRequestPromisify(id, Buffer.from([0xA1]));
                if (res === true) {
                    this.socketGateway.emitStartESPModulesScan(client.id!);
                }
                return res
            }
            return false
        } catch (ex) {
            return false
        }
    }

    async startScanByIds(ids: number[]) {
        const out: { id: number, started: boolean }[] = []
        for (const id of ids) {
            if (this.clients.get(id)?.isActive) {
                const res = await this.startScan(id)
                out.push({ id, started: res });
            }
        }
        return out
    }

    async startScanByMode(mode: ScanMode) {
        const out: { id: number, started: boolean }[] = []
        const ids = Array.from(this.clients.entries()).filter(([_, c]) => c.mode === mode && c.isActive).map(([id]) => id)
        this.logger.log(`[${ids.join(", ")}] ids should be started in ${mode} mode`)
        for (const id of ids) {
            const res = await this.startScan(id)
            out.push({ id, started: res });
        }
        return out
    }

    async stopScan(id: number) {
        try {
            const client = this.clients.get(id)
            const res = await this.sendRequestPromisify(id, Buffer.from([0xA2])) as boolean;
            this.logger.log(`stopped ${id} with res: ${res}`)
            if (client && res === true) {
                this.socketGateway.emitStopESPModulesScan(client.id!);
            }
            return res
        } catch (ex) {
            return false
        }
    }

    async stopScanByMode(mode: ScanMode) {
        const out: { id: number, stopped: boolean }[] = []

        const ids = Array.from(this.clients.entries()).filter(([id, c]) => c.mode === mode).map(el => el[0])
        this.logger.log(`[${ids.join(", ")}] ids should be stopped in ${mode} mode`)

        for (const id of ids) {
            const res = await this.stopScan(id);
            out.push({ id, stopped: res });
        }
        return out
    }

    async getModuleInfo(id: number, type: number) {
        return await this.sendRequestPromisify(id, Buffer.from([0xD1, type]));
    }

    async setRegion(id: number, region: number) {
        return await this.sendRequestPromisify(id, Buffer.from([0xC1, region])) as boolean
    }

    clearScanHistory(mode: ScanMode) {
        for (const [id, client] of Array.from(this.clients.entries())) {
            client.tagScanResults[mode] = []
            this.socketGateway.emitClearScanHistory(id, mode)
        }
        return { cleared: true }
    }

    // ==========================================================
    // List all connected modules
    // ==========================================================
    listConnected() {
        return Array.from(this.clients.entries()).map(([id, c]) => {
            return ({
                id,
                ip: c.ip,
                mode: c.mode,
                currentHardPower: c.currentHardPower,
                currentSoftPower: c.currentSoftPower,
                isActive: c.isActive,
                isScan: c.isScan,
                lastSeen: c.lastSeen,
                status: c.status ?? {},
                tagScanResults: c.tagScanResults ?? {}
            })
        });
    }

    async getInventoryItemShouldBeScanned(epcList: string[]) {
        const p = await this.productService.findItemsShouldBeScanned(epcList)
        this.logger.log("Inventory should be scanned query runned")
        return p
    }
}