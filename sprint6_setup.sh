#!/bin/bash

echo "Iniciando SPRINT 6: Implementação de Persistência de Dados com SQLite (Repository Pattern)"

# 1. Instalar dependências
echo "1. Instalando dependências: sqlite3 e sqlite..."
npm install sqlite3 sqlite

# 2. Criar 'src/domain/math/ISignalRepository.ts'
echo "2. Criando src/domain/math/ISignalRepository.ts..."
cat <<EOF > src/domain/math/ISignalRepository.ts
/**
 * @file src/domain/math/ISignalRepository.ts
 * @description Define a interface para o repositório de sinais, desacoplando o domínio da infraestrutura de persistência.
 */

/**
 * @interface SignalData
 * @description Estrutura de dados para representar um sinal ou resultado de análise a ser persistido.
 */
export interface SignalData {
    /**
     * O tipo do sinal (ex: 'vision_input', 'vision_analysis_result', 'sensor_reading').
     */
    type: string;
    /**
     * O valor do sinal, serializado como string (ex: JSON de um objeto, base64 de uma imagem).
     */
    value: string;
    /**
     * Timestamp da ocorrência do sinal, em milissegundos desde a Época.
     */
    timestamp: number;
    /**
     * Opcional: Resultado da análise associada ao sinal (ex: resposta do Gemini).
     * Serializado como string.
     */
    analysis?: string;
}

/**
 * @interface ISignalRepository
 * @description Contrato para operações de persistência de sinais.
 * Garante que o domínio não dependa de detalhes de implementação do banco de dados.
 */
export interface ISignalRepository {
    /**
     * Salva um sinal no repositório.
     * @param signal Os dados do sinal a serem salvos.
     * @returns Uma Promise que resolve quando o sinal é salvo.
     * @throws Erro se a operação de salvamento falhar.
     */
    saveSignal(signal: SignalData): Promise<void>;
}
EOF

# 3. Implementar 'src/infrastructure/database/SQLiteSignalRepository.ts'
echo "3. Implementando src/infrastructure/database/SQLiteSignalRepository.ts..."
cat <<EOF > src/infrastructure/database/SQLiteSignalRepository.ts
/**
 * @file src/infrastructure/database/SQLiteSignalRepository.ts
 * @description Implementação do ISignalRepository usando SQLite para persistência de dados.
 * Otimizado para o hardware Helio P22.
 */

import * as sqlite from 'sqlite';
import { Database } from 'sqlite';
import { ISignalRepository, SignalData } from '../../domain/math/ISignalRepository';

/**
 * @class SQLiteSignalRepository
 * @implements ISignalRepository
 * @description Repositório para persistir dados de sinais em um banco de dados SQLite.
 * Configurado para performance em dispositivos embarcados.
 */
export class SQLiteSignalRepository implements ISignalRepository {
    private db: Database | null = null;
    private readonly dbPath: string;

    /**
     * Cria uma instância de SQLiteSignalRepository.
     * @param dbPath O caminho para o arquivo do banco de dados SQLite.
     */
    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    /**
     * Inicializa o banco de dados SQLite, abre a conexão, aplica pragmas de performance
     * e cria a tabela 'signals' se ela não existir.
     * @returns Uma Promise que resolve quando o banco de dados é inicializado.
     * @throws Erro se a conexão ou a criação da tabela falhar.
     */
    public async init(): Promise<void> {
        try {
            this.db = await sqlite.open({
                filename: this.dbPath,
                driver: require('sqlite3').Database
            });

            // Otimizações para Helio P22 (2GB RAM)
            // WAL (Write-Ahead Logging) melhora a concorrência e performance de escrita.
            // SYNCHRONOUS=NORMAL reduz a frequência de flushes para o disco, otimizando throughput.
            await this.db.exec('PRAGMA journal_mode=WAL;');
            await this.db.exec('PRAGMA synchronous=NORMAL;');
            await this.db.exec('PRAGMA foreign_keys=ON;'); // Boa prática, mesmo que não haja FKs agora.

            await this.db.exec(\`
                CREATE TABLE IF NOT EXISTS signals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    value TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    analysis TEXT
                );
            \`);
            console.log(\`[SQLiteSignalRepository] Database initialized at \${this.dbPath}\`);
        } catch (error) {
            console.error('[SQLiteSignalRepository] Failed to initialize database:', error);
            throw new Error(\`Failed to initialize SQLite database: \${(error as Error).message}\`);
        }
    }

    /**
     * Salva um sinal no banco de dados 'signals'.
     * @param signal Os dados do sinal a serem salvos.
     * @returns Uma Promise que resolve quando o sinal é salvo.
     * @throws Erro se o banco de dados não estiver inicializado ou a inserção falhar.
     */
    public async saveSignal(signal: SignalData): Promise<void> {
        if (!this.db) {
            throw new Error('[SQLiteSignalRepository] Database not initialized. Call init() first.');
        }

        try {
            const { type, value, timestamp, analysis } = signal;
            await this.db.run(
                'INSERT INTO signals (type, value, timestamp, analysis) VALUES (?, ?, ?, ?)',
                type,
                value,
                timestamp,
                analysis || null // analysis pode ser opcional
            );
            // console.log('[SQLiteSignalRepository] Signal saved successfully.');
        } catch (error) {
            console.error('[SQLiteSignalRepository] Failed to save signal:', error);
            throw new Error(\`Failed to save signal to SQLite: \${(error as Error).message}\`);
        }
    }

    /**
     * Fecha a conexão com o banco de dados.
     * @returns Uma Promise que resolve quando a conexão é fechada.
     */
    public async close(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = null;
            console.log('[SQLiteSignalRepository] Database connection closed.');
        }
    }
}
EOF

# 4. Atualizar 'src/main.ts'
echo "4. Atualizando src/main.ts para instanciar e injetar o SQLiteSignalRepository..."
cat <<EOF > src/main.ts
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
EOF

# Atualizar 'src/config.ts' para incluir sqliteDbPath
echo "Atualizando src/config.ts para incluir 'sqliteDbPath'..."
cat <<EOF > src/config.ts
/**
 * @file src/config.ts
 * @description Configurações globais da aplicação RL.SYS CORE.
 */

export const config = {
    serverPort: parseInt(process.env.PORT || '3000', 10),
    serverHost: process.env.HOST || '0.0.0.0',
    historyBufferSize: parseInt(process.env.HISTORY_BUFFER_SIZE || '100', 10),
    geminiApiKey: process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE',
    sqliteDbPath: process.env.SQLITE_DB_PATH || './data/rl_sys_core.db', // Novo caminho para o DB SQLite
};
EOF

# Criar diretório para o banco de dados se não existir
echo "Criando diretório './data' para o banco de dados SQLite..."
mkdir -p ./data

# 5. Atualizar 'src/infrastructure/http/Server.ts'
echo "5. Atualizando src/infrastructure/http/Server.ts para salvar resultados no banco..."
cat <<EOF > src/infrastructure/http/Server.ts
/**
 * @file src/infrastructure/http/Server.ts
 * @description Servidor HTTP principal da aplicação RL.SYS CORE.
 * Gerencia rotas e interações com adaptadores de infraestrutura.
 */

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import http from 'http';
import { GeminiAdapter } from '../ai/GeminiAdapter';
import { ISignalRepository, SignalData } from '../../domain/math/ISignalRepository'; // Importar a interface e o tipo

/**
 * @class Server
 * @description Gerencia o servidor HTTP, rotas e middlewares.
 * Atua como um ponto de entrada para as operações da aplicação.
 */
export class Server {
    private app: express.Application;
    private httpServer: http.Server | null = null;
    private upload: multer.Multer;

    /**
     * @private
     * @property {GeminiAdapter} geminiAdapter - Adaptador para interagir com a API Gemini.
     */
    private readonly geminiAdapter: GeminiAdapter;

    /**
     * @private
     * @property {ISignalRepository} signalRepository - Repositório para persistir dados de sinais.
     */
    private readonly signalRepository: ISignalRepository;

    /**
     * Cria uma instância do Server.
     * @param port A porta em que o servidor irá escutar.
     * @param host O host em que o servidor irá escutar.
     * @param geminiAdapter Uma instância do GeminiAdapter para integração com IA.
     * @param signalRepository Uma instância do ISignalRepository para persistência de dados.
     */
    constructor(
        private readonly port: number,
        private readonly host: string,
        geminiAdapter: GeminiAdapter,
        signalRepository: ISignalRepository // Injetar o repositório
    ) {
        this.app = express();
        this.geminiAdapter = geminiAdapter;
        this.signalRepository = signalRepository;
        this.upload = multer({ storage: multer.memoryStorage() }); // Multer para lidar com uploads em memória
        this.setupMiddlewares();
        this.setupRoutes();
    }

    /**
     * Configura os middlewares globais da aplicação.
     * @private
     */
    private setupMiddlewares(): void {
        this.app.use(express.json()); // Para parsing de application/json
        this.app.use(express.urlencoded({ extended: true })); // Para parsing de application/x-www-form-urlencoded
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            console.log(\`[HTTP] \${req.method} \${req.url}\`);
            next();
        });
    }

    /**
     * Configura as rotas da API.
     * @private
     */
    private setupRoutes(): void {
        this.app.get('/', (req: Request, res: Response) => {
            res.status(200).send('RL.SYS CORE is running!');
        });

        /**
         * @route POST /api/vision/analyze
         * @description Endpoint para analisar conteúdo visual usando a IA Gemini.
         * Suporta upload de arquivos (imagens) ou JSON com dados de imagem (base64).
         * O resultado da análise é salvo no repositório de sinais.
         * @middleware upload.single('image') - Para lidar com upload de arquivo único.
         */
        this.app.post('/api/vision/analyze', this.upload.single('image'), async (req: Request, res: Response) => {
            let content: string | undefined;
            let contentType: string = 'unknown';

            try {
                if (req.file) {
                    // Se um arquivo foi enviado via 'image' field
                    content = req.file.buffer.toString('base64');
                    contentType = req.file.mimetype || 'image/jpeg';
                    console.log(\`[HTTP] Received image file for analysis: \${req.file.originalname} (\${contentType})\`);
                } else if (req.body && req.body.image_base64) {
                    // Se a imagem foi enviada como base64 no corpo JSON
                    content = req.body.image_base64;
                    contentType = req.body.image_mime_type || 'image/jpeg';
                    console.log('[HTTP] Received base64 image for analysis.');
                } else if (req.body && req.body.text_content) {
                    // Se conteúdo de texto foi enviado
                    content = req.body.text_content;
                    contentType = 'text/plain';
                    console.log('[HTTP] Received text content for analysis.');
                } else {
                    return res.status(400).json({ error: 'No image file, base64 image, or text content provided.' });
                }

                if (!content) {
                    return res.status(400).json({ error: 'Content for analysis is empty.' });
                }

                console.log('[HTTP] Sending content to Gemini for analysis...');
                const geminiResponse = await this.geminiAdapter.generateVisionContent(content, contentType);
                console.log('[HTTP] Gemini analysis complete.');

                // Salvar o sinal e o resultado da análise no repositório
                const signalToSave: SignalData = {
                    type: 'vision_analysis_request',
                    value: JSON.stringify({ content: content.substring(0, 100) + '...', contentType }), // Salva um snippet do conteúdo
                    timestamp: Date.now(),
                    analysis: JSON.stringify(geminiResponse)
                };
                await this.signalRepository.saveSignal(signalToSave);
                console.log('[HTTP] Vision analysis result saved to database.');

                res.status(200).json({
                    message: 'Vision analysis successful',
                    analysisResult: geminiResponse
                });

            } catch (error) {
                console.error('[HTTP] Error during vision analysis:', error);
                res.status(500).json({
                    error: 'Failed to perform vision analysis',
                    details: (error as Error).message
                });
            }
        });

        // Middleware para lidar com rotas não encontradas
        this.app.use((req: Request, res: Response) => {
            res.status(404).send('Not Found');
        });

        // Middleware de tratamento de erros global
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            console.error('[HTTP] Unhandled error:', err);
            res.status(500).json({
                error: 'Internal Server Error',
                details: err.message
            });
        });
    }

    /**
     * Inicia o servidor HTTP.
     * @returns Uma Promise que resolve quando o servidor está escutando.
     */
    public async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.httpServer = this.app.listen(this.port, this.host, () => {
                console.log(\`[HTTP] Server listening on http://\${this.host}:\${this.port}\`);
                resolve();
            }).on('error', (error) => {
                console.error('[HTTP] Server failed to start:', error);
                reject(error);
            });
        });
    }

    /**
     * Para o servidor HTTP.
     * @returns Uma Promise que resolve quando o servidor é parado.
     */
    public async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.httpServer) {
                this.httpServer.close(err => {
                    if (err) {
                        console.error('[HTTP] Error stopping server:', err);
                        return reject(err);
                    }
                    console.log('[HTTP] Server stopped.');
                    resolve();
                });
            } else {
                resolve(); // Servidor não estava rodando
            }
        });
    }
}
EOF

echo "SPRINT 6 concluída com sucesso. Verifique os arquivos e execute 'npm run build' e 'npm start'."
echo "Para testar o endpoint de visão, você pode usar curl ou Postman:"
echo "curl -X POST -H \"Content-Type: application/json\" -d '{\"image_base64\": \"<YOUR_BASE64_IMAGE_STRING>\", \"image_mime_type\": \"image/jpeg\"}' http://localhost:3000/api/vision/analyze"
echo "ou"
echo "curl -X POST -F 'image=@/path/to/your/image.jpg' http://localhost:3000/api/vision/analyze"
echo "Lembre-se de configurar GEMINI_API_KEY e SQLITE_DB_PATH nas variáveis de ambiente ou diretamente em src/config.ts."
```
