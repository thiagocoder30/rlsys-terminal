import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import { ISignalRepository, SignalData } from '../../domain/math/ISignalRepository';

export class SQLiteSignalRepository implements ISignalRepository {
    private db: any = null;
    constructor(private dbPath: string) {}

    async init() {
        this.db = await sqlite.open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec('CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, value TEXT, timestamp INTEGER, analysis TEXT)');
    }

    async saveSignal(signal: SignalData): Promise<void> {
        await this.db.run('INSERT INTO signals (type, value, timestamp, analysis) VALUES (?, ?, ?, ?)',
            signal.type, signal.value, signal.timestamp, signal.analysis);
    }

    async getHistory(limit: number): Promise<any[]> {
        return await this.db.all('SELECT * FROM signals ORDER BY timestamp DESC LIMIT ?', limit);
    }

    async close() { if (this.db) await this.db.close(); }
}
