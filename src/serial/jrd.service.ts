import { Injectable } from "@nestjs/common";
import { Product } from "src/products/entities/product.entity";
import { Tag } from "src/tags/entities/tag.entity";
import { TagsService } from "src/tags/tags.service";
import { JrdHubService } from "./jrd-hub.service";
import { DeviceId, JRDState, JrdStateStore, TagScan } from "./jrd-state.store";
import { ScanMode } from "src/enum/scanMode.enum";

@Injectable()
export class JrdService {
    constructor(
        private readonly tagsService: TagsService,
        private readonly hub: JrdHubService,
        private readonly store: JrdStateStore
    ) { }

    async listAllConnectedDevice() {
        const list = this.hub.list();
        const out = [] as {
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
        }[]

        for (const dev of list) {
            try {
                if (await this.hub.get(dev.id).ping()) {
                    const hwText = await this.hub.get(dev.id).getInfo("hw")
                    const mfgText = await this.hub.get(dev.id).getInfo("mfg")
                    const swText = await this.hub.get(dev.id).getInfo("sw")

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
        // update server-side state + start hardware scan
        for (const id of ids) {
            if (this.store.get(id)?.isActive && this.store.get(id)?.mode === mode) {
                await this.hub.get(id).startScan();
                this.store.ensure(id, { mode, isScan: true });
            }
        }

        // return canonical list so the client can commit
        return await this.listAllConnectedDevice();
    }

    async stopScenario(mode: ScanMode) {
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