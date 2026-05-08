export class HighPerformanceSD {
    count = 0;
    mean = 0;
    M2 = 0;
    constructor() { }
    add(value) {
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
            throw new Error(`Invalid input: value must be a finite number.`);
        }
        this.count++;
        const delta = value - this.mean;
        this.mean += delta / this.count;
        this.M2 += delta * (value - this.mean);
    }
    reset() {
        this.count = 0;
        this.mean = 0;
        this.M2 = 0;
    }
    getCount() { return this.count; }
    getMean() { return this.mean; }
    getVariance(type = 'population') {
        if (this.count === 0)
            throw new Error('No data');
        const divisor = type === 'population' ? this.count : this.count - 1;
        if (divisor <= 0)
            throw new Error('Insufficient data for sample');
        return Math.max(0, this.M2) / divisor;
    }
    getStandardDeviation(type = 'population') {
        return Math.sqrt(this.getVariance(type));
    }
}
