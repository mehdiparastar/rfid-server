import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as ping from 'ping';
import { env } from "src/config/env";
import { IsValidIPStrict } from 'src/helperFunctions/IsValidIpAddress';
import { JrdDeviceClient } from './jrd-device.client';
import { JrdStateStore } from './jrd-state.store';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { type Cache } from 'cache-manager';
import { TagLogService } from './tag-log.service';

type DeviceSpec = { id: string; host: string; port: number };

@Injectable()
export class JrdHubService implements OnModuleInit, OnModuleDestroy {
    private logger = new Logger(JrdHubService.name);
    public specs: DeviceSpec[]
    private devices = new Map<string, JrdDeviceClient>();
    // Add this: Readiness signal for dependents

    constructor(
        private readonly store: JrdStateStore,
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        @Inject(forwardRef(() => TagLogService))
        private readonly tagLoggerService: TagLogService,
    ) { }

    async onModuleInit() {
        // 1) static config
        const env_: string = env("JRD_DEVICES") || 'com7@192.168.43.220:33940,com8@192.168.43.181:33950';
        // Format: "id@host:port,id2@host2:port2"
        this.specs = env_.split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => {
                const [idPart, addr] = s.split('@');
                const [host, portStr] = (addr || '').split(':');
                return { id: idPart || host, host, port: parseInt(portStr || '33940', 10) };
            });

        for (const spec of this.specs) {
            this.addDevice(spec)
        }
    }

    async pingEsp32ByDeviceId(deviceId: string) {

        const cacheKey = `ping_module_${deviceId}_res`
        const ttlMiliSeconds = 1000
        const cached = await this.cacheManager.get<boolean>(cacheKey)

        if (cached !== undefined) {
            this.logger.debug(`cached ping of ${deviceId} have been used.`)
            return cached
        }

        const spec = this.specs.find(el => el.id === deviceId)

        if (spec) {
            if (await (this.get(deviceId)).ping()) {
                if (!this.devices.has(spec.id)) {
                    this.addDevice(spec)
                }
                if (!this.store.has(spec.id)) {
                    this.logger.warn(`${spec.id} added to store with ip of ${spec.host}`)
                    this.store.ensure(spec.id)
                }

                await this.cacheManager.set(cacheKey, true, ttlMiliSeconds)
                return true
            } else {
                if (this.store.has(spec.id)) {
                    this.store.delete(spec.id)
                    this.logger.warn(`${spec.id} removed from store with ip of ${spec.host}`)
                }
            }
            await this.cacheManager.set(cacheKey, false, ttlMiliSeconds)
            return false
        }
        await this.cacheManager.set(cacheKey, false, ttlMiliSeconds)
        return false
    }

    async reDiscoverModules() {
        for (const spec of this.specs) {
            await this.pingEsp32ByDeviceId(spec.id)
        }
        return this.list()
    }

    onModuleDestroy() {
        for (const d of this.devices.values()) d.close();
        this.devices.clear();
    }

    addDevice(spec: DeviceSpec) {
        if (this.devices.has(spec.id)) return;
        const client = new JrdDeviceClient({ id: spec.id, host: spec.host, port: spec.port, timeoutMs: parseInt(process.env.JRD_TIMEOUT_MS ?? '2500', 10) });
        this.devices.set(spec.id, client);
        this.tagLoggerService.attachTagLogger(spec.id)
        this.logger.warn(`${spec.id} added to Devices with ip of ${spec.host}`)

    }

    removeDevice(id: string) {
        const c = this.devices.get(id);
        if (c) { c.close(); this.devices.delete(id); }
    }

    list() {
        return [...this.devices.values()].map(d => ({ id: d.id, host: d.host, port: d.port }));
    }

    get(id: string) {
        try {
            const d = this.devices.get(id);
            if (!d) throw new Error(`device "${id}" not found`);
            return d;
        }
        catch (ex) {
            throw new Error(`device "${id}" not found`);
        }
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
