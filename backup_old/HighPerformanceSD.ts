export type VarianceType = 'population' | 'sample';

export class HighPerformanceSD {
    private count: number = 0;
    private mean: number = 0;
    private M2: number = 0;

    constructor() {}

    public add(value: number): void {
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
            throw new Error(`Invalid input: value must be a finite number.`);
        }
        this.count++;
        const delta = value - this.mean;
        this.mean += delta / this.count;
        this.M2 += delta * (value - this.mean);
    }

    public reset(): void {
        this.count = 0;
        this.mean = 0;
        this.M2 = 0;
    }

    public getCount(): number { return this.count; }
    public getMean(): number { return this.mean; }

    public getVariance(type: VarianceType = 'population'): number {
        if (this.count === 0) throw new Error('No data');
        const divisor = type === 'population' ? this.count : this.count - 1;
        if (divisor <= 0) throw new Error('Insufficient data for sample');
        return Math.max(0, this.M2) / divisor;
    }

    public getStandardDeviation(type: VarianceType = 'population'): number {
        return Math.sqrt(this.getVariance(type));
    }
}
