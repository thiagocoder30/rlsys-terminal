export interface SignalData {
    type: string;
    value: string;
    timestamp: number;
    analysis?: string;
}

export interface ISignalRepository {
    saveSignal(signal: SignalData): Promise<void>;
    getHistory(limit: number): Promise<any[]>;
}
