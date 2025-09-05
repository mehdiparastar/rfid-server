import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SerialPort } from 'serialport';

@Injectable()
export class SerialService implements OnModuleInit {
    private readonly logger = new Logger(SerialService.name);
    private ports: SerialPort[] = [];
    private portSpecs: any[] = []; // Store specs like path, baudRate

    async onModuleInit() {
        await this.initializePorts();
    }

    async initializePorts(reinit = false): Promise<any[]> {
        if (reinit) {
            this.closeAllPorts();
            this.ports = [];
            this.portSpecs = [];
        }

        const availablePorts = await SerialPort.list();
        const usbPorts = availablePorts.filter(port => port.path.includes('/dev/ttyUSB')); // Filter USB serial ports

        for (const portInfo of usbPorts) {
            try {
                const port = new SerialPort({
                    path: portInfo.path,
                    baudRate: 115200, // Common for RFID; adjust if needed (e.g., 115200 for some modules)
                    autoOpen: false,
                });

                port.on('open', async () => {
                    this.ports.push(port);
                    this.portSpecs.push({
                        path: portInfo.path,
                        baudRate: port.baudRate,
                        manufacturer: portInfo.manufacturer || 'Unknown',
                        serialNumber: portInfo.serialNumber || 'N/A',
                    });

                    // Check if RFID module and configure for max power continuous scan
                    const isRfid = await this.isRfidModule(port);
                    if (isRfid) {
                        await this.configureRfidModule(port, portInfo.path);
                    } else {
                        this.logger.warn(`Port ${portInfo.path} not detected as RFID; using raw mode.`);
                    }

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

                    this.logger.warn(`Initialized port: ${JSON.stringify(portInfo)}`);
                });

                // Handle errors during open
                port.on('error', (error) => {
                    this.logger.error(`Error opening ${portInfo.path}: ${error.message}`);
                });

                port.open();

            } catch (error) {
                this.logger.error(`Failed to init ${portInfo.path}: ${error.message}`);
            }
        }

        return this.portSpecs;
    }

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

    private async configureRfidModule(port: SerialPort, portPath: string): Promise<void> {
        try {
            // Set max power (26 dBm = 2600 = 0x0A28)
            const powerCmd = Buffer.from([
                0xBB,
                0x00,
                0xB6,
                0x00, 0x02,
                0x01, 0x2C, // 300 → 30.0 dBm 
                0xE5,       // Checksum = (00 + B6 + 00 + 02 + 01 + 2C) = 0x1E5 → 0xE5
                0x7E
            ]);
            this.logger.debug(`Sending power cmd to ${portPath}: ${powerCmd.toString('hex')}`);
            await this.writeToPort(port, powerCmd);
            const powerResp = await this.readFromPort(port, 1000);
            this.logger.debug(`Power cmd response from ${portPath}: ${powerResp.toString('hex')}`);

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

            this.logger.log(`Configured ${portPath} for max power continuous scan mode`);
        } catch (error) {
            this.logger.error(`Failed to configure ${portPath}: ${error.message}`);
        }
    }

    private async writeToPort(port: SerialPort, data: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            port.write(data, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    private async readFromPort(port: SerialPort, timeoutMs: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let buffer = Buffer.alloc(0);
            const listener = (data: Buffer) => {
                buffer = Buffer.concat([buffer, data]);
                this.logger.debug(`Partial read from ${port.path}: ${buffer.toString('hex')}`);

                // Check if we have a complete frame (starts with 0xBB and ends with 0x7E)
                if (buffer.length > 0 && buffer[0] === 0xBB && buffer[buffer.length - 1] === 0x7E) {
                    this.logger.debug(`Complete frame received from ${port.path}: ${buffer.toString('hex')}`);
                    port.removeAllListeners('data');
                    clearTimeout(timer);
                    resolve(buffer);
                } else if (buffer.length > 0) {
                    this.logger.debug(`Incomplete frame from ${port.path}, length: ${buffer.length}, last byte: 0x${buffer[buffer.length - 1].toString(16)}`);
                }
            };
            port.on('data', listener);

            const timer = setTimeout(() => {
                this.logger.error(`Read timeout on ${port.path} after ${timeoutMs}ms. Buffer: ${buffer.toString('hex')}`);
                port.removeAllListeners('data');
                reject(new Error('Read timeout'));
            }, timeoutMs);
        });
    }

    getPortSpecs(): any[] {
        return this.portSpecs;
    }

    reinitPorts(): Promise<any[]> {
        return this.initializePorts(true);
    }

    private closeAllPorts() {
        this.ports.forEach(port => {
            if (port.isOpen) port.close();
        });
    }
}