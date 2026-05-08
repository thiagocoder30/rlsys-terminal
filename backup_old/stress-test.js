import { HighPerformanceSD } from './HighPerformanceSD.js';
const calculator = new HighPerformanceSD();
const POINTS = 1000000;
console.time('Tempo');
for (let i = 0; i < POINTS; i++) {
    calculator.add(Math.random() * 100);
}
console.timeEnd('Tempo');
console.log(`Final: ${calculator.getCount()} pontos. SD: ${calculator.getStandardDeviation().toFixed(4)}`);
