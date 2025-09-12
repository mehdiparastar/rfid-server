import { BadRequestException, Injectable, Logger, NotAcceptableException, OnModuleInit } from '@nestjs/common';
import { SerialPort } from 'serialport';
import { ScanMode } from './serial.controller';
import { SocketGateway } from 'src/socket/socket.gateway';

@Injectable()
export class SerialService implements OnModuleInit {
    private readonly logger = new Logger(SerialService.name);
    private ports: SerialPort[] = [];
    public rfidPortSpecs: {
        path: string;
        baudRate: number;
        manufacturer: string;
        serialNumber: string;
        pnpId: string;
        productId: string;
        vendorId: string;
        locationId: string;
    }[] = []; // Store specs like path, baudRate
    private rfidPorts: SerialPort[] = [];
    public scanMode: ScanMode | null = null
    public isActiveScenario: boolean = false
    public scanResults: { [key in ScanMode]: any[] } = { "Inventory": [], "Invoice": [], "NewProduct": [] }

    constructor(private readonly socketGateway: SocketGateway) { }

    async onModuleInit() { }

    private async isRfidModule(port: SerialPort): Promise<boolean> {
        try {
            // Send get hardware version: BB 00 03 00 01 00 04 7E
            const cmd = Buffer.from([0xBB, 0x00, 0x03, 0x00, 0x01, 0x00, 0x04, 0x7E]);
            await this.writeToPort(port, cmd);

            // Read response (timeout 500ms)
            const response = await this.readFromPort(port, 500);
            // Check if response starts with BB 01 03 and contains 'M100'
            if (response[0] === 0xBB && response[1] === 0x01 && response[2] === 0x03 && response.toString('ascii').includes('M100')) {
                this.logger.debug(`${port.path} is RFID Module with specs of "${response.toString('ascii')}"`)
                return true;
            }
            return false;
        } catch (error) {
            this.logger.error(`Failed to detect RFID: ${error.message}`);
            return false;
        }
    }

    private async initializePorts() {
        await this.closeAllPorts();

        const availablePorts = await SerialPort.list();
        const usbPorts = availablePorts.filter(port => port.path.includes('/dev/ttyUSB')); // Filter USB serial ports
        this.logger.warn(usbPorts.map(el => el.path).join('\n'))

        for (const portInfo of usbPorts) {
            try {
                const port = new SerialPort({
                    path: portInfo.path,
                    baudRate: 115200, // Common for RFID; adjust if needed (e.g., 115200 for some modules)
                    autoOpen: false
                });

                // Handle errors during open
                port.on('error', (error) => {
                    this.logger.error(`Error opening ${portInfo.path}: ${error.message}`);
                });

                await new Promise<void>((resolve, reject) => {
                    port.on('open', async () => {
                        this.ports.push(port);

                        const isRfid = await this.isRfidModule(port);
                        if (isRfid) {
                            this.rfidPorts.push(port)
                            this.rfidPortSpecs.push({
                                path: portInfo.path,
                                baudRate: port.baudRate,
                                manufacturer: portInfo.manufacturer || 'Unknown',
                                serialNumber: portInfo.serialNumber || 'Unknown',
                                pnpId: portInfo.pnpId || 'Unknown',
                                productId: portInfo.productId || 'Unknown',
                                vendorId: portInfo.vendorId || 'Unknown',
                                locationId: portInfo.locationId || 'Unknown',
                            });

                            // Listen for data (parse notifications for tags)
                            let buffer = Buffer.alloc(0);
                            port.on('data', (data: Buffer) => {
                                buffer = Buffer.concat([buffer, data]);
                                while (buffer.length >= 8) { // Min frame size
                                    if (buffer[0] === 0xBB && buffer[buffer.length - 1] === 0x7E) {
                                        // Full frame; parse if notification (type 0x02)
                                        if (buffer[1] === 0x02 && (buffer[2] === 0x22 || buffer[2] === 0x27)) {
                                            const pl = (buffer[3] << 8) | buffer[4];
                                            const rssi = buffer[5];
                                            const pc = (buffer[6] << 8) | buffer[7];
                                            const epcStart = 8;
                                            const epcEnd = epcStart + (pl - 5); // RSSI(1) + PC(2) + CRC(2)
                                            const epc = buffer.slice(epcStart, epcEnd).toString('hex').toUpperCase();
                                            this.logger.log(`Tag scanned on ${portInfo.path}: EPC=${epc}, RSSI=${rssi}`);
                                            if (this.scanMode && this.scanResults[this.scanMode].findIndex(el => el.epc === epc) === -1) {
                                                this.scanResults[this.scanMode].push({ rssi, epc, pc, pl })
                                                this.socketGateway.emitScanResult({ rssi, epc, pc, pl })
                                            }
                                        }
                                        buffer = Buffer.alloc(0); // Reset after processing
                                    } else {
                                        // Incomplete; shift buffer if no header/end
                                        const headerIdx = buffer.indexOf(0xBB);
                                        if (headerIdx > 0) buffer = buffer.slice(headerIdx);
                                        else if (headerIdx === -1) buffer = Buffer.alloc(0);
                                        break;
                                    }
                                }
                            });

                            this.logger.warn(`Initialized RFID port: ${JSON.stringify(portInfo)}`);
                        }
                        resolve()
                    });

                    port.open(error => {
                        if (error) {
                            reject(`Error opening port: ${error}`);
                        }
                    })

                })

            } catch (error) {
                this.logger.error(`Failed to init ${portInfo.path}: ${error.message}`);
            }
        }

        return this.rfidPortSpecs;
    }


    private percentToCentiDbm(pct: number): number {
        const minDbm = 0;  // Minimum dBm value
        const maxDbm = 26;  // Set max power - max is 26 and min is 15

        const dbm = pct * (maxDbm - minDbm) / 100;  // scale to dBm
        return Math.round(dbm);
    }

    private centiDbmToPercent(centiDbm: number): number {
        const minDbm = 0;  // Minimum dBm value
        const maxDbm = 26; // Maximum dBm value

        const pct = centiDbm * 100 / (maxDbm - minDbm);  // Convert centi-dBm to dBm (e.g., 2000 → 20.0)
        return Math.round(pct);  // Clamp to 0-100 range
    }


    private buildSetScannerPowerFrame(centiDbm: number): Buffer {
        const type = 0x00;  // Command type
        const cmd = 0xB6;   // Set power command
        const plMsb = 0x00;
        const plLsb = 0x02;

        // Packing the power value into two bytes (big-endian)
        const powMsb = (centiDbm >> 8) & 0xFF;
        const powLsb = centiDbm & 0xFF;

        // Calculate checksum
        const checksum = (type + cmd + plMsb + plLsb + powMsb + powLsb) & 0xFF;

        return Buffer.from([0xBB, type, cmd, plMsb, plLsb, powMsb, powLsb, checksum, 0x7E]);
    }

    private parseSetScannerPowerResponse(resp: Buffer): boolean {
        if (resp.length < 8 || resp[0] !== 0xBB || resp[1] !== 0x01 || resp[2] !== 0xB6) return false;
        const pl = (resp[3] << 8) | resp[4];
        if (pl !== 0x0001) return false;
        const status = resp[5];
        const sum = (resp[1] + resp[2] + resp[3] + resp[4] + status) & 0xff;
        if (resp[6] !== sum) return false;
        return status === 0x00;
    }

    public async setScannerPower(powerPercent: number) {
        const set_result: { success: boolean; path: string; }[] = []
        for (const rfidPort of this.rfidPorts) {
            try {
                const centiDbm = this.percentToCentiDbm(powerPercent) * 100;  // Calculate centi-dBm
                this.logger.fatal(centiDbm, powerPercent)
                // Send set power command
                const frame = this.buildSetScannerPowerFrame(centiDbm);
                await this.writeToPort(rfidPort, frame);
                const resp = await this.readFromPort(rfidPort, 1000);

                const success = this.parseSetScannerPowerResponse(resp);

                if (!success) {
                    this.logger.error(`Failed to set power on ${rfidPort.path}`);
                }
                set_result.push({ success: success, path: rfidPort.path })
            } catch (error) {
                this.logger.error(`Error setting power on ${rfidPort.path}: ${error.message}`);
            }
        }
        return set_result
    }


    private buildGetScannerPowerFrame(): Buffer {
        // BB 00 B7 00 00 B7 7E
        return Buffer.from([0xBB, 0x00, 0xB7, 0x00, 0x00, 0xB7, 0x7E]);
    }

    private parseGetScannerPowerResponse(resp: Buffer): { raw: number; dbm: number } {
        // Expect: BB 01 B7 00 02 PowMSB PowLSB CS 7E
        if (resp.length < 9 || resp[0] !== 0xBB || resp[1] !== 0x01 || resp[2] !== 0xB7)
            throw new Error(`Unexpected get-power response: ${resp.toString("hex")}`);

        const pl = (resp[3] << 8) | resp[4];
        if (pl !== 0x0002) throw new Error(`Invalid PL for get-power: ${pl}`);

        const powMsb = resp[5], powLsb = resp[6];
        const raw = (powMsb << 8) | powLsb; // centi-dBm per spec (e.g., 2000 = 20.00 dBm)

        // checksum (LSB of sum from Type..last param)
        const sum = (resp[1] + resp[2] + resp[3] + resp[4] + powMsb + powLsb) & 0xff;
        if (resp[7] !== sum) throw new Error(`Checksum mismatch, got 0x${resp[7].toString(16)}, want 0x${sum.toString(16)}`);

        return { raw, dbm: raw / 100 };
    }

    public async getScannerCurrentPowerDbm(mode: ScanMode) {
        if (this.isActiveScenario === false) {
            try {
                const res: { dbm: number; raw: number; path: string, percent: number }[] = []

                for (const rfidPort of this.rfidPorts) {
                    const frame = this.buildGetScannerPowerFrame();
                    this.logger.debug(`TX (${rfidPort.path}) get-power: ${frame.toString("hex")}`);

                    await this.writeToPort(rfidPort, frame);
                    const resp = await this.readFromPort(rfidPort, 1000);

                    this.logger.debug(`RX (${rfidPort.path}) get-power: ${resp.toString("hex")}`);

                    const parsed = this.parseGetScannerPowerResponse(resp);
                    this.logger.log(`Current RF power on ${rfidPort.path}: ${parsed.dbm.toFixed(1)} dBm (Raw: ${parsed.raw})`);
                    res.push({ ...parsed, path: rfidPort.path, percent: this.centiDbmToPercent(parsed.dbm) });
                }
                return res
            }
            catch (error) {
                this.logger.error(`Failed to getting current power. ${error.message}`);
                throw new BadRequestException(`Failed to  getting current power. ${error.message}`)
            }
        }
        throw new NotAcceptableException(`Another scenario is active, STOP it and then retry. (${this.scanMode} Mode is active.)`)
    }


    /** Generic frame builder (Type=0x00) */
    private buildFrame(cmd: number, params: number[] = []): Buffer {
        const type = 0x00;
        const pl = params.length;
        const plMsb = (pl >> 8) & 0xff;
        const plLsb = pl & 0xff;

        // checksum = LSB of sum(Type..last param)
        let sum = (type + cmd + plMsb + plLsb) & 0xff;
        for (const p of params) sum = (sum + (p & 0xff)) & 0xff;

        return Buffer.from([0xBB, type, cmd, plMsb, plLsb, ...params, sum, 0x7E]);
    }

    /** Start multi-inventory. CNT=0 => run “forever” (until Stop). */
    private buildStartContinuousInventoryFrame(cnt: number = 0): Buffer {
        // Command 0x27, PL=0x0003, Reserved=0x22, CNT=MSB,LSB
        const params = [0x22, (cnt >> 8) & 0xff, cnt & 0xff];
        return this.buildFrame(0x27, params);
    }

    /** Stop multi-inventory immediately (not pause). */
    private buildStopInventoryFrame(): Buffer {
        // Command 0x28, PL=0x0000
        return this.buildFrame(0x28);
    }

    private parseInventoryNotifyFrame(frame: Buffer) {
        const type = frame[1], cmd = frame[2];
        if (type !== 0x02 || (cmd !== 0x22 && cmd !== 0x27)) {
            throw new Error(`Not an inventory notify: type=0x${type.toString(16)} cmd=0x${cmd.toString(16)}`);
        }
        const pl = (frame[3] << 8) | frame[4];
        const rssiByte = frame[5]; // signed
        const pc = (frame[6] << 8) | frame[7];
        const epcLen = pl - 1 - 2 - 2;
        const epc = frame.subarray(8, 8 + epcLen);
        const crcMsbIdx = 8 + epcLen;
        const crc = (frame[crcMsbIdx] << 8) | frame[crcMsbIdx + 1];

        return {
            rssiDbm: (rssiByte & 0x80) ? rssiByte - 0x100 : rssiByte, // signed dBm per spec
            pc,
            epcHex: epc.toString('hex').toUpperCase(),
            crc,
        };
    }

    public async startContinuous(mode: ScanMode) {
        if (this.isActiveScenario) throw new NotAcceptableException(`Another scenario is active.`);
        if (this.scanMode !== mode) throw new NotAcceptableException(this.scanMode === null ? `You dont have inited yet.` : `you initd as ${this.scanMode} scenario.`);

        this.isActiveScenario = true;
        try {
            for (const rfidPort of this.rfidPorts) {
                const start = this.buildStartContinuousInventoryFrame(5000000);
                await this.writeToPort(rfidPort, start);
                this.logger.log(`Started continuous inventory on ${rfidPort.path}`);
                // Now keep using your existing stream parser to consume frames
                // and call parseInventoryNotifyFrame(...) for Type=0x02 frames.
            }
            return this.scenarioState()
        } catch (e) {
            this.isActiveScenario = false;
            throw e;
        }
    }

    public async stopContinuous() {
        for (const port of this.rfidPorts) {
            const stop = this.buildStopInventoryFrame();
            await this.writeToPort(port, stop);
            this.logger.log(`Stopped continuous inventory on ${port.path}`);
        }
        this.isActiveScenario = false;
        // this.scanMode = null
        this.scanResults.Inventory = [] // its for test
        return this.scenarioState()
    }

    public scenarioState() {
        return {
            isActiveScenario: this.isActiveScenario,
            scanMode: this.scanMode
        }
    }




    getRFIDPortSpecs(mode: ScanMode) {
        if (!this.scanMode) {
            throw new NotAcceptableException(`You don't have init any scenario yet, please select your desired power and then INIT.`)
        }
        if (this.scanMode === mode) {
            return this.rfidPortSpecs;
        }
        throw new NotAcceptableException(`Another scenario is active, STOP it and then retry. (${this.scanMode} Mode is active.)`)
    }


    async InitScenario(power: number, mode: ScanMode) {
        if (this.isActiveScenario === false) {
            try {
                const initingRes = await this.initializePorts()
                const powerSetRes = await this.setScannerPower(power)
                const getPowerValue = await this.getScannerCurrentPowerDbm(mode)
                if (initingRes.length > 0 && powerSetRes.length > 0 && getPowerValue.length > 0) {
                    this.scanMode = mode
                    return ({
                        initingRes,
                        powerSetRes: powerSetRes.map(item => ({
                            ...item,
                            dbm: getPowerValue.find(el => el.path === item.path)?.dbm,
                            percent: getPowerValue.find(el => el.path === item.path)?.percent,
                        })),
                        scanMode: this.scanMode
                    })
                }
                throw new NotAcceptableException("Can't init modules successfully, assess your conectivity.")
            }
            catch (error) {
                this.logger.error(`Failed to initing. ${error.message}`);
                throw new BadRequestException(`Failed to initing. ${error.message}`)
            }
        }
        throw new NotAcceptableException(`STOP active scenario. (${this.scanMode} Mode is active.)`)
    }


    private async setScannerToContinuousMode(port: SerialPort, portPath: string, time: number): Promise<void> {
        try {
            // Start continuous scan 
            const scanCmd = Buffer.from([
                0xBB,       // Header
                0x00,       // Type (command)
                0x27,       // Command (multi-inventory)
                0x00, 0x03, // PL = 3
                0x22,       // Reserved
                0x2A, 0xF8, // CNT = 11000 polls
                0x6E,       // Checksum (0x00+0x27+0x00+0x03+0x22+0x00+0x64 = 0x01B0 → 0xB0)
                0x7E        // End
            ]);
            this.logger.debug(`Sending scan cmd to ${portPath}: ${scanCmd.toString('hex')}`);
            await this.writeToPort(port, scanCmd);
            const scanResp = await this.readFromPort(port, 10000);
            this.logger.debug(`Scan cmd response from ${portPath}: ${scanResp.toString('hex')}`);

            this.logger.log(`Configured ${portPath} for continuous scan mode`);
        } catch (error) {
            this.logger.error(`Failed to configure ${portPath}: ${error.message}`);
        }
    }


    private async writeToPort(port: SerialPort, data: Buffer): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            port.write(data, (err) => (err ? reject(err) : resolve()));
        });
        await new Promise<void>((resolve, reject) => {
            port.drain((err) => (err ? reject(err) : resolve()));
        });
    }

    private async readFromPort(port: SerialPort, timeoutMs: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let buffer = Buffer.alloc(0);

            const done = (frame?: Buffer, err?: Error) => {
                clearTimeout(timer);
                port.off('data', onData);
                if (err) return reject(err);
                resolve(frame!);
            };

            const tryExtract = () => {
                // find start 0xBB
                let start = buffer.indexOf(0xBB);
                if (start === -1) {
                    // no header yet, keep buffering
                    return;
                }
                if (start > 0) buffer = buffer.subarray(start); // drop leading noise

                // need at least header+type+cmd+PL = 5 bytes after 0xBB
                if (buffer.length < 5) return;

                const pl = (buffer[3] << 8) | buffer[4];
                const total = 1 /*BB*/ + 1 /*Type*/ + 1 /*Cmd*/ + 2 /*PL*/ + pl + 1 /*CS*/ + 1 /*7E*/;

                if (buffer.length < total) return; // wait for more

                const frame = buffer.subarray(0, total);
                const end = frame[total - 1];
                if (end !== 0x7E) {
                    // desync; drop this BB and continue
                    buffer = buffer.subarray(1);
                    return tryExtract();
                }

                // optional: verify checksum for all frames
                const type = frame[1], cmd = frame[2];
                let sum = (type + cmd + frame[3] + frame[4]) & 0xff;
                for (let i = 0; i < pl; i++) sum = (sum + frame[5 + i]) & 0xff;
                const cs = frame[5 + pl];
                if (cs !== sum) {
                    // bad frame; drop this header and continue
                    buffer = buffer.subarray(1);
                    return tryExtract();
                }

                // success
                done(frame);
            };

            const onData = (data: Buffer) => {
                buffer = Buffer.concat([buffer, data]);
                this.logger.debug(`RX chunk on ${port.path}: ${data.toString('hex')}`);
                tryExtract();
            };

            port.on('data', onData);

            const timer = setTimeout(() => {
                done(undefined, new Error(`Read timeout on ${port.path} after ${timeoutMs}ms. Buf=${buffer.toString('hex')}`));
            }, timeoutMs);
        });
    }

    private async closeAllPorts() {
        await Promise.all(
            this.ports.map((port) => {
                return new Promise<void>((resolve, reject) => {
                    if (port.isOpen) {
                        port.close((error) => {
                            if (error) {
                                reject(`Error closing port ${port.path}: ${error}`);
                            } else {
                                if (!port.isOpen) {
                                    this.ports = this.ports.filter(p => p.path !== port.path);
                                    this.rfidPortSpecs = this.rfidPortSpecs.filter(p => p.path !== port.path);
                                    this.rfidPorts = this.rfidPorts.filter(p => p.path !== port.path);
                                    resolve(); // Resolve the promise when the port is successfully closed
                                }
                            }
                        });
                    } else {
                        this.ports = this.ports.filter(p => p.path !== port.path);
                        this.rfidPortSpecs = this.rfidPortSpecs.filter(p => p.path !== port.path);
                        this.rfidPorts = this.rfidPorts.filter(p => p.path !== port.path);
                        resolve(); // If the port isn't open, resolve immediately
                    }
                });
            })
        )


        // for (const port of this.ports) {
        //     if (port.isOpen) {
        //         port.close((error) => {
        //             if (!error) {
        //                 if (!port.isOpen) {
        //                     this.ports = this.ports.filter(p => p.path !== port.path)
        //                     this.rfidPortSpecs = this.rfidPortSpecs.filter(p => p.path !== port.path)
        //                     this.rfidPorts = this.rfidPorts.filter(p => p.path !== port.path)
        //                 }
        //             }
        //         })
        //     }
        // }
    }
}