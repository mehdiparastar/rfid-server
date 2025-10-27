import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { JrdHubService } from './jrd-hub.service';
import { SocketGateway } from 'src/socket/socket.gateway';
import { JrdStateStore } from './jrd-state.store';

@Injectable()
export class TagLogService implements OnModuleInit {
    private logger = new Logger('TagLog');

    constructor(
        private readonly hub: JrdHubService,
        private readonly socketGateway: SocketGateway,
        private readonly store: JrdStateStore
    ) { }

    onModuleInit() {
        // subscribe to every device’s tag$ once
        const attach = (id: string) => {
            const dev = this.hub.get(id);
            dev.tag$.subscribe(ev => {
                this.logger.log(`[${id}] EPC=${ev.epc} RSSI=${ev.rssi}`)
                const mode = (this.store.get(id) || { mode: "Inventory" }).mode
                const power = this.store.get(id)?.power || 1
                const rssiBasedPower = (power === 14 ? -66 : power === 13 ? -64 : power === 12 ? -62 : power === 11 ? -60 : power === 10 ? -58 : power === 9 ? -56 : power === 8 ? -54 : power === 7 ? -52 : power === 6 ? -50 : power === 5 ? -48 : power === 4 ? -46 : power === 3 ? -44 : power === 2 ? -42 : -40)

                if ((!this.store.get(id)?.tagScanResults[mode].map(el => el.epc).includes(ev.epc)) && ((power < 15 && ev.rssi > rssiBasedPower) || power >= 15)) {
                    this.store.appendResults(id, mode, [{ rssi: ev.rssi, epc: ev.epc, scantimestamp: new Date().getTime() }], { dedupeByEpc: true })
                    this.socketGateway.emitScanResult({ rssi: ev.rssi, epc: ev.epc, scantimestamp: new Date().getTime() }, mode, id)
                }
            });

        };
        this.hub.list().forEach(d => attach(d.id));
        // If you enable mDNS discovery, call attach inside addDevice as well.
    }
}
