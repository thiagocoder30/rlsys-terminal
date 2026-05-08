/**
 * @file src/main.ts
 * @description Ponto de entrada principal da aplicação RL.SYS CORE.
 * Responsável pela composição e inicialização dos módulos.
 */

import { Server } from './infrastructure/http/Server';
import { GeminiAdapter } from './infrastructure/ai/GeminiAdapter';
import { HistoryBuffer } from './domain/math/HistoryBuffer';
import { config } from './config';
import { SQLiteSignalRepository } from './infrastructure/database/SQLiteSignalRepository';
import { ISignalRepository } from './domain/math/ISignalRepository';

async function bootstrap() {
    console.log('[RL.SYS CORE] Initializing...');

    // 1. Configuração
    const { serverPort, serverHost, historyBufferSize, geminiApiKey, sqliteDbPath } = config;

    // 2. Infraestrutura de Persistência (SQLite)
    const signalRepository: ISignalRepository = new SQLiteSignalRepository(sqliteDbPath);
    await (signalRepository as SQLiteSignalRepository).init(); // Chama init() na implementação concreta

    // 3. Domínio
    const historyBuffer = new HistoryBuffer<any>(historyBufferSize); // Exemplo de uso do HistoryBuffer

    // 4. Adapters de Infraestrutura
    const geminiAdapter = new GeminiAdapter(geminiApiKey);

    // 5. Servidor HTTP (Composition Root)
    const server = new Server(serverPort, serverHost, geminiAdapter, signalRepository);

    // 6. Iniciar Servidor
    server.start();

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('[RL.SYS CORE] SIGTERM received. Shutting down gracefully...');
        await server.stop();
        await (signalRepository as SQLiteSignalRepository).close();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('[RL.SYS CORE] SIGINT received. Shutting down gracefully...');
        await server.stop();
        await (signalRepository as SQLiteSignalRepository).close();
        process.exit(0);
    });

    console.log('[RL.SYS CORE] Initialization complete.');
}

bootstrap().catch(error => {
    console.error('[RL.SYS CORE] Fatal error during bootstrap:', error);
    process.exit(1);
});
