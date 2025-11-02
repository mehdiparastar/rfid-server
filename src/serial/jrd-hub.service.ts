import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JrdDeviceClient } from './jrd-device.client';
import { env } from "src/config/env";
import dns from 'dns/promises';

type DeviceSpec = { id: string; host: string; port: number };

@Injectable()
export class JrdHubService implements OnModuleInit, OnModuleDestroy {
    private devices = new Map<string, JrdDeviceClient>();
    // Add this: Readiness signal for dependents
    public readonly initPromise: Promise<void>;

    private _resolveInit?: () => void;  // Private resolver for the promise

    constructor() {
        // Initialize the promise in constructor (always pending until onModuleInit finishes)
        this.initPromise = new Promise<void>((resolve) => {
            this._resolveInit = resolve;
        });
    }

    async onModuleInit() {
        // 1) static config
        const env_ = env("JRD_DEVICES") || 'com7@192.168.43.220:33940,com8@192.168.43.181:33950';
        // Format: "id@host:port,id2@host2:port2"
        const specs: DeviceSpec[] = env_.split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => {
                const [idPart, addr] = s.split('@');
                const [host, portStr] = (addr || '').split(':');
                return { id: idPart || host, host, port: parseInt(portStr || '33940', 10) };
            });

        const hostToIPMapper = {}
        for (const s of specs) {
            try {
                const [ip] = await dns.resolve4(s.host)
                if (ip) hostToIPMapper[s.host] = ip
            } catch (err) { }
        }


        for (const spec of specs) {
            if (!!hostToIPMapper[spec.host])
                this.addDevice({ ...spec, host: hostToIPMapper[spec.host] || spec.host })
        };
        
        // 2) OPTIONAL: auto-discovery via mDNS (_jrd._udp)
        // uncomment if you want automatic adoption of new modules:
        // this.startMdnsDiscovery();

        this._resolveInit?.();
    }

    onModuleDestroy() {
        for (const d of this.devices.values()) d.close();
        this.devices.clear();
    }


    addDevice(spec: DeviceSpec) {
        if (this.devices.has(spec.id)) return;
        const client = new JrdDeviceClient({ id: spec.id, host: spec.host, port: spec.port, timeoutMs: parseInt(process.env.JRD_TIMEOUT_MS ?? '2500', 10) });
        this.devices.set(spec.id, client);
    }

    removeDevice(id: string) {
        const c = this.devices.get(id);
        if (c) { c.close(); this.devices.delete(id); }
    }

    list() {
        return [...this.devices.values()].map(d => ({ id: d.id, host: d.host, port: d.port }));
    }

    get(id: string): JrdDeviceClient {
        const d = this.devices.get(id);
        if (!d) throw new Error(`device "${id}" not found`);
        return d;
    }

    // ---- OPTIONAL mDNS discovery (Bonjour) ----
    private mdnsTimer?: NodeJS.Timeout;
    private startMdnsDiscovery() {
        // npm i bonjour-service
        // We look for _jrd._udp services and auto-register with id = <hostname> or <instanceName>
        const Bonjour = require('bonjour-service');
        const bonjour = new Bonjour();
        const browser = bonjour.find({ type: 'jrd', protocol: 'udp' });

        browser.on('up', (svc: any) => {
            const host = (svc.host || svc.fqdn || svc.name || '').replace(/\.$/, '');
            const port = svc.port || 33940;
            const id = svc.name || host;
            // prefer IPv4 address if given
            const ipv4 = (svc.addresses || []).find((a: string) => a.includes('.')) || host;
            this.addDevice({ id, host: ipv4, port });
            // You could also call .ping() here and drop if unreachable
        });

        // occasionally rebrowse to refresh
        this.mdnsTimer = setInterval(() => browser.update(), 60_000);
    }
}
