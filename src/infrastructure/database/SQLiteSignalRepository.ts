import * as sqlite from 'sqlite';
import { ISignalRepository, SignalData } from '../../domain/math/ISignalRepository';

export class SQLiteSignalRepository implements ISignalRepository {
    private db: sqlite.Database | null = null;
    constructor(private dbPath: string) {}

    public async init(): Promise<void> {
        this.db = await sqlite.open({
            filename: this.dbPath,
            driver: require('sqlite3').Database
        });
        await this.db.exec('PRAGMA journal_mode=WAL;');
        await this.db.exec('PRAGMA synchronous=NORMAL;');
        await this.db.exec('CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, value TEXT, timestamp INTEGER, analysis TEXT);');
        console.log(`[DB] SQLite ON: ${this.dbPath}`);
    }

    public async saveSignal(signal: SignalData): Promise<void> {
        if (!this.db) throw new Error('DB not initialized');
        await this.db.run('INSERT INTO signals (type, value, timestamp, analysis) VALUES (?, ?, ?, ?)', 
            signal.type, signal.value, signal.timestamp, signal.analysis);
    }

    public async close(): Promise<void> {
        if (this.db) await this.db.close();
    }
}
