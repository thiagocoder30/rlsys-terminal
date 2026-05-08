/**
 * @file src/config.ts
 * @description Configurações globais da aplicação RL.SYS CORE.
 */

export const config = {
    serverPort: parseInt(process.env.PORT || '3000', 10),
    serverHost: process.env.HOST || '0.0.0.0',
    historyBufferSize: parseInt(process.env.HISTORY_BUFFER_SIZE || '100', 10),
    geminiApiKey: 'AIzaSyA7hxO4N9puHhFcmQSEjmZ40xT6dbE3JSI',
    sqliteDbPath: process.env.SQLITE_DB_PATH || './data/rl_sys_core.db',
};
