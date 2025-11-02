import { Inject, Injectable } from "@nestjs/common";
import { Product } from "src/products/entities/product.entity";
import { Tag } from "src/tags/entities/tag.entity";
import { TagsService } from "src/tags/tags.service";
import { JrdHubService } from "./jrd-hub.service";
import { DeviceId, JRDState, JrdStateStore, TagScan } from "./jrd-state.store";
import { ScanMode } from "src/enum/scanMode.enum";
import { type Cache } from 'cache-manager';
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { SocketGateway } from "src/socket/socket.gateway";

export interface IjrdList {
    info: {
        type: string;
        text: string;
    }[];
    dev: {
        id: string;
        host: string;
        port: number;
    };
    currentPower: number,
    isActive: boolean,
    mode: ScanMode
}


type ScenarioKey = string;

interface Scenario {
    id: ScenarioKey;
    mode: ScanMode;
    ids: string[];
    timer?: NodeJS.Timeout;
    startedAt: Date;
}

@Injectable()
export class JrdService {
    private scenarios = new Map<ScenarioKey, Scenario>();
    private readonly AUTO_STOP_MS = 4 * 60 * 1000; // 4 minutes

    constructor(
        private readonly tagsService: TagsService,
        private readonly hub: JrdHubService,
        private readonly store: JrdStateStore,
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private readonly socketGateway: SocketGateway,
    ) { }

    private getScenarioKey(mode: ScanMode, ids: string[]): ScenarioKey {
        // Make sure ids order doesn't affect uniqueness
        return `${mode}:${ids.sort().join(',')}`;
    }

    async listAllConnectedDevice() {
        const list = this.hub.list();
        const out = [] as IjrdList[]

        for (const dev of list) {
            try {
                if (await this.hub.get(dev.id).ping()) {
                    const cacheKey_hw = `modules-init-hw`;
                    const cacheKey_mfg = `modules-init-mfg`;
                    const cacheKey_sw = `modules-init-sw`;
                    const ttlSeconds = 12000000;

                    const hwText_cached = await this.cacheManager.get<string>(cacheKey_hw)
                    const mfgText_cached = await this.cacheManager.get<string>(cacheKey_mfg)
                    const swText_cached = await this.cacheManager.get<string>(cacheKey_sw)

                    const hwText = hwText_cached ? hwText_cached : await this.hub.get(dev.id).getInfo("hw")
                    const mfgText = mfgText_cached ? mfgText_cached : await this.hub.get(dev.id).getInfo("mfg")
                    const swText = swText_cached ? swText_cached : await this.hub.get(dev.id).getInfo("sw")

                    if (!hwText_cached) {
                        console.log('cached')
                        await this.cacheManager.set(cacheKey_hw, hwText, ttlSeconds)
                    }
                    if (!mfgText_cached) { await this.cacheManager.set(cacheKey_mfg, mfgText, ttlSeconds) }
                    if (!swText_cached) { await this.cacheManager.set(cacheKey_sw, swText, ttlSeconds) }

                    const currentPower = await this.hub.get(dev.id).getPower()
                    const inStorePower = this.store.get(dev.id)?.power
                    const isActive = this.store.get(dev.id)?.isActive ?? false
                    const mode = this.store.get(dev.id)?.mode ?? "Inventory"

                    out.push({
                        info: [
                            { type: "hw", text: hwText },
                            { type: "mfg", text: mfgText },
                            { type: "sw", text: swText },
                        ],
                        currentPower: (inStorePower && inStorePower < 15) ? inStorePower : currentPower,
                        dev,
                        isActive,
                        mode
                    })
                }
            }
            catch {
                // ignore
            }
        }
        return out
    }

    async moduleInit(id: DeviceId, seed?: Partial<JRDState>) {
        return this.store.ensure(id, seed);
    }

    currentScenario() {
        return this.store.allStates()
    }

    async startScenario(ids: string[], mode: ScanMode) {
        const key = this.getScenarioKey(mode, ids);

        // ✅ If same mode+ids scenario is already active → do nothing
        if (this.scenarios.has(key)) {
            return this.listAllConnectedDevice();
        }

        // ✅ Start scanning only for given ids
        for (const id of ids) {
            const device = this.store.get(id);
            if (device?.isActive && device.mode === mode) {
                await this.hub.get(id).startScan();
                this.store.ensure(id, { mode, isScan: true });
            }
        }

        // ⏱️ Schedule auto-stop
        const timer = setTimeout(() => {
            this.stopScenario(mode, ids).catch(console.error);
        }, this.AUTO_STOP_MS);

        // 💾 Track scenario
        this.scenarios.set(key, {
            id: key,
            mode,
            ids,
            timer,
            startedAt: new Date(),
        });

        // return canonical list so the client can commit
        this.socketGateway.emitUpdateScanStartStop(mode, this.currentScenario())
        return await this.listAllConnectedDevice();
    }

    async stopScenario(mode: ScanMode, ids?: string[]) {
        const key = ids ? this.getScenarioKey(mode, ids) : undefined;

        // 🧩 Case 1: Stop one specific scenario
        if (key && this.scenarios.has(key)) {
            const scenario = this.scenarios.get(key);
            if (!scenario) return this.listAllConnectedDevice();

            if (scenario.timer) clearTimeout(scenario.timer);

            for (const id of scenario.ids) {
                await this.hub.get(id).stopScan();
                this.store.ensure(id, { mode, isScan: false });
            }

            this.scenarios.delete(key);
            this.socketGateway.emitUpdateScanStartStop(mode, this.currentScenario())
            return this.listAllConnectedDevice();
        }

        // 🧩 Case 2: Stop all scenarios with the given mode
        const keysToRemove = [...this.scenarios.entries()]
            .filter(([_, s]) => s.mode === mode)
            .map(([key]) => key);

        for (const k of keysToRemove) {
            const scenario = this.scenarios.get(k);
            if (!scenario) continue;

            if (scenario.timer) clearTimeout(scenario.timer);

            for (const id of scenario.ids) {
                await this.hub.get(id).stopScan();
                this.store.ensure(id, { mode, isScan: false });
            }

            this.scenarios.delete(k);
        }

        this.socketGateway.emitUpdateScanStartStop(mode, this.currentScenario())

        return this.listAllConnectedDevice();

        const currentScenario = this.store.allStates()
        // update server-side state + start hardware scan
        for (const el of currentScenario) {
            if (el.state.mode === mode) {
                await this.hub.get(el.id).stopScan();
                this.store.ensure(el.id, { mode, isScan: false });
            }
        }


        // return canonical list so the client can commit
        return await this.listAllConnectedDevice();
    }

    async clearScenarioHistory(mode: ScanMode) {
        const currentScenario = this.store.allStates()
        // update server-side state + start hardware scan
        for (const el of currentScenario) {
            this.store.clearResults(el.id, mode);
        }


        // return canonical list so the client can commit
        return true;
    }


    async scanResult(mode: ScanMode) {
        const currentScenario = this.store.allStates()

        for (const el of currentScenario) {
            const orgTags = this.store.get(el.id)?.tagScanResults[mode]
            if (orgTags && orgTags.length > 0) {

                if (mode === "Scan") {
                    const dbTags = (await this.tagsService.findtagsByTagEPC(orgTags.map(tag => tag.epc!)))
                        .map(t => ({ ...t, scantimestamp: orgTags.find(el => el.epc === t.epc)?.scantimestamp }))

                    const products: (Product & { scantimestamp?: number })[] = []

                    for (const tag of dbTags) {
                        for (const product of tag.products) {
                            const soldQuantity = product.saleItems.reduce((p, c) => p + c.quantity, 0)
                            if (product.quantity - soldQuantity > 0) {
                                products.push({ ...product, scantimestamp: tag.scantimestamp })
                            }
                        }
                    }

                    return { 'Scan': [...new Map(products.map(item => [item.id, item])).values()].map(item => ({ ...item, deviceId: el.id })) }
                }
                if (mode === "Inventory") {
                    const dbTags = (await this.tagsService.findtagsByTagEPC(orgTags.map(tag => tag.epc!)))
                        .map(t => ({ ...t, scantimestamp: orgTags.find(el => el.epc === t.epc)?.scantimestamp }))

                    const products: (Product & { scantimestamp?: number })[] = []

                    for (const tag of dbTags) {
                        for (const product of tag.products) {
                            const soldQuantity = product.saleItems.reduce((p, c) => p + c.quantity, 0)
                            if ((product.quantity - soldQuantity > 0) && product.inventoryItem) {
                                products.push({ ...product, scantimestamp: tag.scantimestamp })
                            }
                        }
                    }

                    return { 'Inventory': [...new Map(products.map(item => [item.id, item])).values()].map(item => ({ ...item, deviceId: el.id })) }
                }
                if (mode === "NewProduct") {
                    const dbTags = (await this.tagsService.findtagsByTagEPC(orgTags.map(tag => tag.epc!)))
                        .map(t => ({ ...t, scantimestamp: orgTags.find(el => el.epc === t.epc)?.scantimestamp }))
                    const tags_ = orgTags.map(t => ({ ...t, ...dbTags.find(el => el.epc === t.epc) }))
                    const validTags: TagScan[] = []
                    for (const tag of tags_) {
                        if (!tag.products || tag.products.length === 0) {
                            validTags.push(tag)
                        } else {
                            validTags.push(tag)
                            for (const product of tag.products) {
                                const soldQuantity = product.saleItems.reduce((p, c) => p + c.quantity, 0)
                                if (product.quantity - soldQuantity > 0) {
                                    validTags.pop()
                                    break
                                }
                            }
                        }
                    }

                    return { 'NewProduct': validTags.map(item => ({ ...item, deviceId: el.id })) }
                }
            }
        }

    }
}