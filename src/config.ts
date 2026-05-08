/**
 * @file src/config.ts
 * @description Configurações globais da aplicação RL.SYS CORE.
 */
import 'dotenv/config'; // Certifique-se de ter o pacote dotenv instalado

export const config = {
    serverPort: parseInt(process.env.PORT || '3000', 10),
    serverHost: process.env.HOST || '0.0.0.0',
    historyBufferSize: parseInt(process.env.HISTORY_BUFFER_SIZE || '100', 10),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    sqliteDbPath: process.env.SQLITE_DB_PATH || './data/rl_sys_core.db',
};
