export function parseRfidRawFrame(raw: string) {
    if (!raw || typeof raw !== 'string') {
        return { error: 'No raw frame to parse' };
    }

    // Convert hex string → byte array
    const bytes = raw.match(/.{1,2}/g)?.map(x => parseInt(x, 16)) ?? [];

    if (bytes.length < 7) {
        return { error: 'Frame too short' };
    }

    const header = bytes[0];
    const type = bytes[1];
    const command = bytes[2];
    const payloadLength = (bytes[3] << 8) | bytes[4];

    const payload = bytes.slice(5, 5 + payloadLength);
    const checksum = bytes[5 + payloadLength];
    const end = bytes[6 + payloadLength];

    // Validate header + end
    if (header !== 0xBB || end !== 0x7E) {
        return { error: 'Invalid frame format' };
    }

    // ==========================================================
    // 0xFF ERROR FRAME HANDLING (Embedded Here)
    // ==========================================================
    if (command === 0xFF) {
        const errorCode = payload[0] ?? null;
        return {
            command: 'error',
            errorCode,
            errorMeaning: mapErrorCode(errorCode)   // embedded error mapping
        };
    }

    // ==========================================================
    // COMMAND-BASED PARSING
    // ==========================================================
    switch (command) {

        // ---------------------------------
        // 0xB7 = GET CURRENT POWER
        // ---------------------------------
        case 0xB7: {
            if (payload.length !== 2) {
                return { command: 'getCurrentPower', error: 'Invalid payload length' };
            }
            const val = (payload[0] << 8) | payload[1];
            return {
                command: 'getCurrentPower',
                powerRaw: val,
                powerDbm: val / 100
            };
        }

        // ---------------------------------
        // 0xB6 = SET POWER (response)
        // ---------------------------------
        case 0xB6:
            return {
                command: 'setPower',
                success: payload[0] === 0x00
            };

        // ---------------------------------
        // 0x22 = TAG INVENTORY REPORT
        // ---------------------------------
        case 0x22: {
            if (payload.length < 5) {
                return { command: 'inventory', error: 'Payload too small' };
            }

            const rssi = payload[0];
            const pc = (payload[1] << 8) | payload[2];

            const epcBytes = payload.slice(3, payload.length - 2);
            const epc = epcBytes.map(b => b.toString(16).padStart(2, '0')).join('');

            const crc = (payload[payload.length - 2] << 8) | payload[payload.length - 1];

            return {
                command: 'inventory',
                rssi: (rssi > 127 ? rssi - 256 : rssi),
                pc,
                epc,
                crc
            };
        }

        // ---------------------------------
        // 0x03 = GET MODULE INFO
        // ---------------------------------
        case 0x03: {
            const infoType = payload[0];
            const ascii = payload.slice(1).map(b => String.fromCharCode(b)).join('');

            return {
                command: 'getModuleInfo',
                infoType,
                info:
                    infoType === 0 ? { type: 'hardware', value: ascii }
                        : infoType === 1 ? { type: 'software', value: ascii }
                            : infoType === 2 ? { type: 'manufacturer', value: ascii }
                                : { type: 'unknown', value: ascii }
            };
        }

        // ---------------------------------
        // 0x07 = SET REGION RESPONSE
        // ---------------------------------
        case 0x07:
            return {
                command: 'setRegion',
                success: payload[0] === 0x00
            };

        // ---------------------------------
        // 0x28 = STOP SCAN RESPONSE
        // ---------------------------------
        case 0x28: {
            return {
                command: 'stopScan',
                success: payload[0] === 0x00
            };
        }

        // -----------------------------------------
        // 0x27 = START CONTINUOUS SCAN RESPONSE
        // -----------------------------------------
        case 0x27:
            // Note: JRD100 returns NO RAW EPC FRAME here.
            return {
                command: 'startScan',
                started: true
            };

        // ---------------------------------
        // Default (unknown)
        // ---------------------------------
        default:
            return {
                command: 'unknown',
                commandCode: command,
                payloadHex: payload.map(b => b.toString(16).padStart(2, '0')).join('')
            };
    }
}



// =========================================================
// ERROR CODE MAPPING FROM MAGICRF DOCUMENT
// =========================================================
function mapErrorCode(code: number) {
    const map: Record<number, string> = {
        0x15: 'No tag / CRC error (Inventory)',
        0x09: 'Tag not found for READ',
        0x10: 'Tag not found for WRITE',
        0x13: 'Tag not found for LOCK',
        0x12: 'Tag not found for KILL',
        0x16: 'Wrong Access Password',
        0x17: "Invalid Parameter / Argument Error",
        0xA3: 'Read error: Memory overrun',
        0xB3: 'Write error: Memory overrun',
        0xC4: 'Lock error: Memory locked',
        0xD0: 'Kill error: Kill password not set',
    };

    return map[code] ?? 'Unknown RFID error';
}
