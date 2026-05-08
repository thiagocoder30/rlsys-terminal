import { Server } from './infrastructure/http/Server';
import { GeminiAdapter } from './infrastructure/adapters/GeminiAdapter';
import { SQLiteSignalRepository } from './infrastructure/database/SQLiteSignalRepository';
import { config } from './config';

async function bootstrap() {
    const { serverPort, serverHost, sqliteDbPath, geminiApiKey } = config;

    const signalRepository = new SQLiteSignalRepository(sqliteDbPath);
    await signalRepository.init();

    const geminiAdapter = new GeminiAdapter(geminiApiKey);
    const server = new Server(serverPort, serverHost, geminiAdapter, signalRepository);

    server.start();

    process.on('SIGINT', async () => {
        await server.stop();
        await signalRepository.close();
        process.exit(0);
    });
}
bootstrap().catch(console.error);
