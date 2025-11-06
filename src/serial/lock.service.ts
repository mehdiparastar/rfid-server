import { Injectable } from '@nestjs/common';

@Injectable()
export class LockService {
    private stopScenarioInProgress = false;
    private waiters: (() => void)[] = [];

    async acquire() {
        if (!this.stopScenarioInProgress) return;

        await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    startStopScenario() {
        this.stopScenarioInProgress = true;
    }

    finishStopScenario() {
        this.stopScenarioInProgress = false;
        this.waiters.forEach((resolve) => resolve());
        this.waiters = [];
    }

    isLocked() {
        return this.stopScenarioInProgress;
    }
}
