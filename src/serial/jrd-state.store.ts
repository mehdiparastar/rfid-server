import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ScanMode } from '../enum/scanMode.enum';
import { Tag } from 'src/tags/entities/tag.entity';

export type DeviceId = string;
export type TagScan = Partial<Tag> & { scantimestamp: number, scanRSSI?: number }
export type TagScanResults = Record<ScanMode, TagScan[]>;
export interface JRDState {
    mode: ScanMode;
    power: number;
    type: 'ESP32' | 'SERIAL';
    isActive: boolean;
    isScan: boolean;
    tagScanResults: TagScanResults;
}

const EMPTY_RESULTS: TagScanResults = {
    Inventory: [],
    Scan: [],
    NewProduct: [],
};

export const emptyResults = (): TagScanResults => ({
    Inventory: [],
    Scan: [],
    NewProduct: [],
});

const snapshot = <T>(v: T): T => JSON.parse(JSON.stringify(v));

@Injectable()
export class JrdStateStore implements OnModuleInit, OnModuleDestroy {
    private readonly map = new Map<DeviceId, JRDState>();
    private readonly lastTouched = new Map<DeviceId, number>();

    // default: 1h TTL, sweep every 5 minutes
    private readonly idleTtlMs = 60 * 60 * 1000;   // 1 hour
    private readonly sweepEveryMs = 5 * 60 * 1000; // 5 minutes


    private timer?: NodeJS.Timeout;

    onModuleInit() {
        this.timer = setInterval(() => this.sweep(), this.sweepEveryMs);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    // --- TTL helpers ---
    private touch(id: DeviceId) {
        this.lastTouched.set(id, Date.now());
    }

    private isIdle(id: DeviceId) {
        const t = this.lastTouched.get(id);
        return typeof t === 'number' ? Date.now() - t > this.idleTtlMs : false;
    }

    private sweep() {
        for (const [id, state] of this.map.entries()) {
            if (this.isIdle(id)) {
                // Clear only tag buffers; keep other state
                state.tagScanResults = emptyResults();
                // Optionally: also mark inactive, or delete device entirely
                // state.isActive = false;
                // this.map.delete(id); this.lastTouched.delete(id);
            }
        }
    }

    // --- API ---
    upsert(id: DeviceId, state: JRDState): void {
        this.map.set(id, state);
        this.touch(id);
    }

    ensure(
        id: DeviceId,
        seed?: Partial<Omit<JRDState, 'tagScanResults'>> & {
            tagScanResults?: TagScanResults
        }
    ): JRDState {
        const current =
            this.map.get(id) ??
            {
                mode: 'Inventory' as const,
                power: 15,
                type: 'ESP32' as const,
                isActive: true,
                isScan: false,
                tagScanResults: emptyResults(),
            };

        const merged: JRDState = {
            ...current,
            ...seed,
            tagScanResults: {
                Inventory: seed?.tagScanResults?.Inventory ?? current.tagScanResults.Inventory ?? EMPTY_RESULTS.Inventory,
                Scan: seed?.tagScanResults?.Scan ?? current.tagScanResults.Scan ?? EMPTY_RESULTS.Scan,
                NewProduct: seed?.tagScanResults?.NewProduct ?? current.tagScanResults.NewProduct ?? EMPTY_RESULTS.NewProduct,
            },
        };

        this.map.set(id, merged);
        this.touch(id);
        return merged;
    }

    get(id: DeviceId): Readonly<JRDState> | undefined {
        const v = this.map.get(id);
        if (v) this.touch(id);
        return v ? snapshot(v) : undefined;
    }

    has(id: DeviceId): boolean {
        return this.map.has(id);
    }

    delete(id: DeviceId): boolean {
        this.lastTouched.delete(id);
        return this.map.delete(id);
    }

    setMode(id: DeviceId, mode: ScanMode): Readonly<JRDState> {
        const s = this.ensure(id);
        s.mode = mode;
        this.touch(id);
        return snapshot(s);
    }

    setPower(id: DeviceId, power: number): Readonly<JRDState> {
        const s = this.ensure(id);
        s.power = power;
        this.touch(id);
        return snapshot(s);
    }

    setActive(id: DeviceId, isActive: boolean): Readonly<JRDState> {
        const s = this.ensure(id);
        s.isActive = isActive;
        this.touch(id);
        return snapshot(s);
    }

    setIsScan(id: DeviceId, isScan: boolean): Readonly<JRDState> {
        const s = this.ensure(id);
        s.isScan = isScan;
        this.touch(id);
        return snapshot(s);
    }

    appendResults(
        id: DeviceId,
        mode: ScanMode,
        tags: TagScan[],
        opts?: { dedupeByEpc?: boolean; cap?: number }
    ): Readonly<TagScan[]> {
        const s = this.ensure(id);
        const bucket = s.tagScanResults[mode] ?? [];
        let next = bucket.concat(tags);

        if (opts?.dedupeByEpc) {
            const byEpc = new Map<string, TagScan>();
            for (const t of next) {
                const epc = (t as TagScan & { epc?: string }).epc;
                if (epc) byEpc.set(epc, t);
            }
            next = Array.from(byEpc.values());
        }
        if (opts?.cap && next.length > opts.cap) {
            next = next.slice(next.length - opts.cap);
        }

        s.tagScanResults[mode] = next;
        this.touch(id);
        return snapshot(next);
    }

    clearResults(id: DeviceId, mode?: ScanMode): Readonly<JRDState> {
        const s = this.ensure(id);
        if (mode) {
            s.tagScanResults[mode] = [];
        } else {
            s.tagScanResults = emptyResults();
        }
        this.touch(id);
        return snapshot(s);
    }

    readonlyView(): ReadonlyMap<DeviceId, JRDState> {
        return this.map;
    }

    allStates(): ReadonlyArray<{ id: DeviceId; state: Readonly<JRDState> }> {
        return Array.from(this.map, ([id, s]) => ({ id, state: snapshot(s) }));
    }
}
