import { Subject } from 'rxjs';
import * as dgram from 'node:dgram';

export interface JrdTagEvent {
    epc: string;
    rssi: number;
    pc: string;
    crc: string;
    raw: string;
}

export class JrdDeviceClient {
    readonly id: string;
    readonly host: string;
    readonly port: number;
    private readonly timeoutMs: number;

    private socket: dgram.Socket;
    private busy: Promise<void> = Promise.resolve();

    // streams
    public readonly event$ = new Subject<string>();
    public readonly tag$ = new Subject<JrdTagEvent>();

    constructor(opts: { id: string; host: string; port: number; timeoutMs?: number; }) {
        this.id = opts.id;
        this.host = opts.host;
        this.port = opts.port;
        this.timeoutMs = opts.timeoutMs ?? 2500;

        this.socket = dgram.createSocket('udp4');
        this.socket.bind(); // ephemeral local port for replies + events
        this.socket.on('message', (msg) => this.onMessage(msg));
    }

    // -------- request/response plumbing (per-device) --------
    private pendingResolve?: (s: string) => void;
    private pendingTimer?: NodeJS.Timeout;

    private onMessage(msg: Buffer) {
        const text = msg.toString('ascii').trim();

        if (text.startsWith('event_hex')) {
            this.event$.next(text);
            const bytes = this.hexLineToBytes(text);
            this.pushBytes(bytes);
            this.drainFrames();
            return;
        }

        if (this.pendingResolve) {
            const r = this.pendingResolve;
            this.pendingResolve = undefined;
            if (this.pendingTimer) clearTimeout(this.pendingTimer);
            this.pendingTimer = undefined;
            r(text);
        }
    }

    private sendCommand(text: string): Promise<string> {
        // The real operation the caller awaits
        const op = new Promise<string>((resolve, reject) => {
            if (this.pendingResolve) {
                return reject(new Error('request already in flight'));
            }

            this.pendingResolve = resolve;
            this.pendingTimer = setTimeout(() => {
                this.pendingResolve = undefined;
                reject(new Error('timeout waiting for reply'));
            }, this.timeoutMs);

            const buf = Buffer.from(text, 'ascii');
            this.socket.send(buf, 0, buf.length, this.port, this.host, (err) => {
                if (err) {
                    this.pendingResolve = undefined;
                    if (this.pendingTimer) clearTimeout(this.pendingTimer);
                    this.pendingTimer = undefined;
                    reject(err);
                }
            });
        });

        // Update the serialized queue with a void promise
        this.busy = this.busy
            .then(() => op.then(() => undefined).catch(() => undefined));

        // Return the actual result to the caller
        return op;
    }

    // -------- public API (exactly your current methods) --------
    async ping() {
        const r = await this.sendCommand('ping');
        return r === 'pong';
    }
    async getPower(): Promise<number> {
        const r = await this.sendCommand('get_power');
        if (r.startsWith('power_dbm')) {
            const v = parseFloat(r.split(/\s+/)[1]); if (!Number.isNaN(v)) return v;
        }
        throw new Error(`get_power failed: ${r}`);
    }
    async setPower(dbm: number): Promise<void> {
        const r = await this.sendCommand(`set_power=${Math.round(dbm)}`);
        if (r.trim().toLowerCase() !== 'ok') throw new Error(`set_power failed: ${r}`);
    }
    async getInfo(type: 'hw' | 'sw' | 'mfg' = 'hw'): Promise<string> {
        const r = await this.sendCommand(`info=${type}`);
        if (r.startsWith('info ')) return r.slice(5);
        throw new Error(`info failed: ${r}`);
    }
    async startScan(): Promise<void> {
        const r = await this.sendCommand('start_scan');
        if (!/^scan_started/i.test(r)) throw new Error(`start_scan failed: ${r}`);
    }
    async stopScan(): Promise<void> {
        const r = await this.sendCommand('stop_scan');
        if (!/^scan_stopped/i.test(r)) throw new Error(`stop_scan failed or uncertain: ${r}`);
    }

    // -------- reassembly & parsing (same as your code) --------
    private rxAcc = Buffer.alloc(0);

    private hexLineToBytes(line: string): Buffer {
        const hex = line.replace(/^event_hex\s*/i, '').trim();
        const parts = hex.split(/\s+/).filter(Boolean);
        const b = Buffer.alloc(parts.length);
        for (let i = 0; i < parts.length; i++) b[i] = parseInt(parts[i], 16) & 0xFF;
        return b;
    }
    private pushBytes(b: Buffer) {
        if (b.length === 0) return;
        this.rxAcc = Buffer.concat([this.rxAcc, b], this.rxAcc.length + b.length);
        // if (this.rxAcc.length > 8192) this.rxAcc = this.rxAcc.slice(-4096); // deprecated
        if (this.rxAcc.length > 8192) this.rxAcc = this.rxAcc.subarray(this.rxAcc.length - 4096);
    }
    private drainFrames() {
        while (true) {
            const start = this.rxAcc.indexOf(0xBB);
            if (start < 0) { this.rxAcc = Buffer.alloc(0); return; }
            // if (start > 0) this.rxAcc = this.rxAcc.slice(start); // deprecated
            if (start > 0) this.rxAcc = this.rxAcc.subarray(start);
            if (this.rxAcc.length < 7) return;

            const type = this.rxAcc[1];
            const cmd = this.rxAcc[2];
            const len = (this.rxAcc[3] << 8) | this.rxAcc[4];
            const total = 1 + 1 + 1 + 2 + len + 1 + 1;
            if (total > 6000 || total < 7) { this.rxAcc = this.rxAcc.slice(1); continue; }
            if (this.rxAcc.length < total) return;

            // const frame = this.rxAcc.slice(0, total); // deprecated
            // this.rxAcc = this.rxAcc.slice(total); // deprecated
            const frame = this.rxAcc.subarray(0, total);
            this.rxAcc = this.rxAcc.subarray(total);
            if (frame[frame.length - 1] !== 0x7E) continue;

            // const sumRange = frame.slice(1, 1 + 1 + 1 + 2 + len); // deprecated
            const sumRange = frame.subarray(1, 1 + 1 + 1 + 2 + len);
            const sum = sumRange.reduce((a, b) => (a + b) & 0xFF, 0);
            const cs = frame[frame.length - 2];
            if (cs !== sum) continue;

            if (type === 0x02 && cmd === 0x22) {
                // const payload = frame.slice(5, 5 + len); // deprecated
                const payload = frame.subarray(5, 5 + len);
                const ev = this.parseNotify(payload, frame);
                if (ev) this.tag$.next(ev);
            }
        }
    }
    private parseNotify(payload: Buffer, full: Buffer): JrdTagEvent | null {
        if (payload.length < 5) return null;
        const rssi = (payload[0] & 0xFF);
        // const pc = payload.slice(1, 3);
        const pc = payload.subarray(1, 3);
        // const crc = payload.slice(payload.length - 2); // deprecated
        // const epc = payload.slice(3, payload.length - 2); // deprecated
        const crc = payload.subarray(payload.length - 2);
        const epc = payload.subarray(3, payload.length - 2);
        const hex = (b: Buffer) => [...b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        return {
            epc: hex(epc), rssi: (rssi & 0x80) ? (rssi - 256) : rssi, pc: hex(pc), crc: hex(crc),
            raw: [...full].map(x => x.toString(16).padStart(2, '0')).join(' ').toUpperCase()
        };
    }

    close() {
        this.event$.complete();
        this.tag$.complete();
        this.socket?.close();
    }
}
