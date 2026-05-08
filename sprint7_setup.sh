#!/bin/bash

# SPRINT 7: Implementação da API de Histórico e Dashboard Web de Monitoramento

echo "Iniciando SPRINT 7: Atualizando arquivos do projeto RL.SYS CORE..."

# 1. Atualiza 'src/domain/math/ISignalRepository.ts'
# Adiciona a interface SignalData e o método getHistory.
mkdir -p src/domain/math
cat <<EOF > src/domain/math/ISignalRepository.ts
// src/domain/math/ISignalRepository.ts

/**
 * @interface SignalData
 * @description Representa a estrutura de um dado de sinal processado pela IA.
 *              Esta interface define o contrato para os dados de sinal em todo o domínio.
 */
export interface SignalData {
    id: string;
    timestamp: string; // ISO 8601 string (e.g., "2023-10-27T10:00:00.000Z")
    type: string;      // Tipo do sinal (e.g., "temperature", "vibration", "analysis_result")
    value: number;     // Valor numérico principal do sinal
    metadata: Record<string, any>; // Dados adicionais em formato JSON (objeto)
}

/**
 * @interface ISignalRepository
 * @description Contrato para operações de persistência e recuperação de dados de sinal.
 *              Esta interface é parte do domínio e não deve depender de detalhes de infraestrutura.
 */
export interface ISignalRepository {
    /**
     * Salva um novo dado de sinal no repositório.
     * @param signal O objeto SignalData a ser salvo.
     * @returns Uma Promise que resolve quando o sinal é salvo.
     */
    save(signal: SignalData): Promise<void>;

    /**
     * Recupera um histórico de dados de sinal, ordenados do mais recente para o mais antigo.
     * @param limit O número máximo de sinais a serem retornados.
     * @returns Uma Promise que resolve com um array de SignalData.
     */
    getHistory(limit: number): Promise<SignalData[]>;
}
EOF
echo "✅ 'src/domain/math/ISignalRepository.ts' atualizado."

# 2. Atualiza 'src/infrastructure/database/SQLiteSignalRepository.ts'
# Implementa o método getHistory e garante a tipagem correta.
mkdir -p src/infrastructure/database
cat <<EOF > src/infrastructure/database/SQLiteSignalRepository.ts
// src/infrastructure/database/SQLiteSignalRepository.ts

import * as sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { ISignalRepository, SignalData } from '../../domain/math/ISignalRepository'; // Importa a interface e o tipo

/**
 * @class SQLiteSignalRepository
 * @implements {ISignalRepository}
 * @description Implementação concreta de ISignalRepository usando SQLite.
 *              Gerencia a persistência de dados de sinal em um banco de dados SQLite.
 */
export class SQLiteSignalRepository implements ISignalRepository {
    private db!: Database;
    private dbPath: string;

    /**
     * Construtor do repositório SQLite.
     * @param dbPath O caminho para o arquivo do banco de dados SQLite.
     */
    constructor(dbPath: string = './data/signals.db') {
        this.dbPath = dbPath;
    }

    /**
     * Inicializa a conexão com o banco de dados e cria a tabela 'signals' se não existir.
     * @returns Uma Promise que resolve quando o banco de dados é inicializado.
     */
    public async initialize(): Promise<void> {
        this.db = await open({
            filename: this.dbPath,
            driver: sqlite3.Database,
        });
        await this.db.run(\`
            CREATE TABLE IF NOT EXISTS signals (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                type TEXT NOT NULL,
                value REAL NOT NULL,
                metadata TEXT
            );
        \`);
        console.log(\`SQLite database initialized at \${this.dbPath}\`);
    }

    /**
     * Salva um novo dado de sinal no banco de dados.
     * @param signal O objeto SignalData a ser salvo.
     * @returns Uma Promise que resolve quando o sinal é salvo.
     */
    public async save(signal: SignalData): Promise<void> {
        try {
            const metadataJson = JSON.stringify(signal.metadata || {});
            await this.db.run(
                'INSERT INTO signals (id, timestamp, type, value, metadata) VALUES (?, ?, ?, ?, ?)',
                signal.id,
                signal.timestamp,
                signal.type,
                signal.value,
                metadataJson
            );
        } catch (error) {
            console.error('Error saving signal to SQLite:', error);
            throw new Error('Failed to save signal data.');
        }
    }

    /**
     * Recupera um histórico de dados de sinal, ordenados do mais recente para o mais antigo.
     * @param limit O número máximo de sinais a serem retornados.
     * @returns Uma Promise que resolve com um array de SignalData.
     */
    public async getHistory(limit: number): Promise<SignalData[]> {
        try {
            const query = 'SELECT id, timestamp, type, value, metadata FROM signals ORDER BY timestamp DESC LIMIT ?';
            const rows = await this.db.all(query, limit);

            return rows.map(row => ({
                id: row.id,
                timestamp: row.timestamp, // Já deve estar em formato ISO string
                type: row.type,
                value: row.value,
                metadata: JSON.parse(row.metadata || '{}') // Garante que metadata seja um objeto
            }));
        } catch (error) {
            console.error('Error fetching signal history from SQLite:', error);
            throw new Error('Failed to retrieve signal history.');
        }
    }
}
EOF
echo "✅ 'src/infrastructure/database/SQLiteSignalRepository.ts' atualizado."

# 3. Atualiza 'src/infrastructure/http/Server.ts'
# Adiciona a rota '/api/history' e o middleware para servir arquivos estáticos.
mkdir -p src/infrastructure/http
cat <<EOF > src/infrastructure/http/Server.ts
// src/infrastructure/http/Server.ts

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { ISignalRepository, SignalData } from '../../domain/math/ISignalRepository'; // Importa ISignalRepository e SignalData
import { v4 as uuidv4 } from 'uuid'; // Para gerar IDs únicos

/**
 * @class Server
 * @description Configura e inicia o servidor HTTP usando Express.
 *              Gerencia rotas para upload de arquivos, visão e agora histórico de sinais.
 */
export class Server {
    public app: express.Application;
    private port: number;
    private upload: multer.Multer;
    private signalRepository: ISignalRepository; // Injeção de dependência do repositório

    /**
     * Construtor do servidor.
     * @param port A porta em que o servidor irá escutar.
     * @param signalRepository Uma instância de ISignalRepository para persistência de sinais.
     */
    constructor(port: number, signalRepository: ISignalRepository) {
        this.app = express();
        this.port = port;
        this.signalRepository = signalRepository;

        // Configuração do Multer para upload de arquivos
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, 'uploads/'); // Garante que o diretório 'uploads/' exista
            },
            filename: (req, file, cb) => {
                cb(null, Date.now() + '-' + file.originalname);
            }
        });
        this.upload = multer({ storage: storage });

        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Configura os middlewares globais do Express.
     */
    private setupMiddleware(): void {
        this.app.use(express.json()); // Para parsear JSON no corpo das requisições
        this.app.use(express.urlencoded({ extended: true })); // Para parsear URL-encoded bodies
        // Middleware para log de requisições (opcional, mas útil para depuração)
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            console.log(\`[HTTP] \${req.method} \${req.url}\`);
            next();
        });
    }

    /**
     * Configura todas as rotas da aplicação.
     */
    private setupRoutes(): void {
        // Rota de upload de arquivos (existente)
        this.app.post('/upload', this.upload.single('file'), async (req: Request, res: Response) => {
            if (!req.file) {
                return res.status(400).send('Nenhum arquivo enviado.');
            }
            console.log('Arquivo recebido:', req.file.filename);

            // Exemplo de como salvar um sinal após o upload
            const signal: SignalData = {
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                type: 'file_upload',
                value: req.file.size, // Tamanho do arquivo como valor
                metadata: {
                    filename: req.file.filename,
                    mimetype: req.file.mimetype,
                    originalName: req.file.originalname,
                    path: req.file.path
                }
            };
            try {
                await this.signalRepository.save(signal);
                res.status(200).json({ message: 'Arquivo enviado e sinal registrado com sucesso!', filename: req.file.filename });
            } catch (error) {
                console.error('Erro ao salvar sinal de upload:', error);
                res.status(500).json({ error: 'Erro ao processar o upload e registrar o sinal.' });
            }
        });

        // Rota de visão (existente)
        this.app.get('/vision', (req: Request, res: Response) => {
            res.status(200).send('Endpoint de visão acessado. Implementação futura para processamento de imagem/vídeo.');
        });

        // NOVA ROTA: API de Histórico de Sinais
        this.app.get('/api/history', async (req: Request, res: Response) => {
            try {
                const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20; // Default para 20 sinais
                if (isNaN(limit) || limit <= 0) {
                    return res.status(400).json({ error: 'Parâmetro "limit" inválido. Deve ser um número positivo.' });
                }
                const history = await this.signalRepository.getHistory(limit);
                res.json(history);
            } catch (error) {
                console.error('Erro ao buscar histórico de sinais:', error);
                res.status(500).json({ error: 'Falha ao recuperar o histórico de sinais.' });
            }
        });

        // Serve arquivos estáticos da raiz do projeto (para o index.html e outros assets)
        this.app.use(express.static("."));

        // Rota padrão para 404 (deve ser a última)
        this.app.use((req: Request, res: Response) => {
            res.status(404).send('Página não encontrada.');
        });
    }

    /**
     * Inicia o servidor HTTP.
     */
    public start(): void {
        this.app.listen(this.port, () => {
            console.log(\`Servidor HTTP RL.SYS CORE rodando na porta \${this.port}\`);
            console.log(\`Acesse o Dashboard em http://localhost:\${this.port}/index.html\`);
        });
    }
}
EOF
echo "✅ 'src/infrastructure/http/Server.ts' atualizado."

# 4. Sobrescreve 'index.html' na raiz
# Cria um Dashboard Dark Mode moderno com Tailwind CSS.
cat <<EOF > index.html
<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RL.SYS CORE Dashboard</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        // Configuração do Tailwind para Dark Mode
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        primary: '#6366f1', // Indigo 500
                        secondary: '#a78bfa', // Violet 400
                        darkbg: '#1a202c', // Dark background
                        darkcard: '#2d3748', // Dark card background
                        darktext: '#e2e8f0', // Light text on dark
                    }
                }
            }
        }
    </script>
    <style>
        body {
            font-family: 'Inter', sans-serif;
        }
        /* Estilos para scrollbar em dark mode */
        ::-webkit-scrollbar {
            width: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #2d3748; /* darkcard */
        }
        ::-webkit-scrollbar-thumb {
            background: #4a5568; /* gray-600 */
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #6366f1; /* primary */
        }
    </style>
</head>
<body class="bg-darkbg text-darktext min-h-screen p-4">
    <div class="container mx-auto max-w-4xl">
        <header class="flex justify-between items-center mb-8 pb-4 border-b border-gray-700">
            <h1 class="text-4xl font-bold text-primary">RL.SYS CORE Dashboard</h1>
            <div id="system-status" class="flex items-center space-x-2">
                <span class="relative flex h-3 w-3">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" id="status-ping"></span>
                    <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500" id="status-dot"></span>
                </span>
                <span class="text-lg font-medium" id="status-text">Online</span>
            </div>
        </header>

        <main>
            <section class="mb-8">
                <h2 class="text-2xl font-semibold text-secondary mb-4">Feed de Análises Recentes</h2>
                <div class="flex justify-end mb-4">
                    <button id="refresh-feed-btn" class="px-4 py-2 bg-primary hover:bg-indigo-600 text-white font-semibold rounded-lg shadow-md transition duration-300 ease-in-out">
                        Atualizar Feed
                    </button>
                </div>
                <div id="signals-feed" class="space-y-4">
                    <!-- Cards de sinais serão injetados aqui -->
                    <p class="text-gray-400 text-center" id="loading-message">Carregando histórico de sinais...</p>
                </div>
            </section>
        </main>
    </div>

    <script>
        const signalsFeed = document.getElementById('signals-feed');
        const refreshButton = document.getElementById('refresh-feed-btn');
        const statusDot = document.getElementById('status-dot');
        const statusPing = document.getElementById('status-ping');
        const statusText = document.getElementById('status-text');
        const loadingMessage = document.getElementById('loading-message');

        const API_HISTORY_URL = '/api/history?limit=20'; // Limite padrão de 20 sinais

        /**
         * Atualiza o status do sistema no dashboard.
         * @param {boolean} isOnline - True se o sistema estiver online, false caso contrário.
         */
        function updateSystemStatus(isOnline) {
            if (isOnline) {
                statusDot.className = 'relative inline-flex rounded-full h-3 w-3 bg-green-500';
                statusPing.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75';
                statusText.textContent = 'Online';
                statusText.classList.remove('text-red-500');
                statusText.classList.add('text-green-500');
            } else {
                statusDot.className = 'relative inline-flex rounded-full h-3 w-3 bg-red-500';
                statusPing.className = 'hidden'; // Remove o ping quando offline
                statusText.textContent = 'Offline';
                statusText.classList.remove('text-green-500');
                statusText.classList.add('text-red-500');
            }
        }

        /**
         * Formata um timestamp ISO string para uma string legível.
         * @param {string} isoString - O timestamp em formato ISO 8601.
         * @returns {string} O timestamp formatado.
         */
        function formatTimestamp(isoString) {
            try {
                const date = new Date(isoString);
                return date.toLocaleString('pt-BR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
            } catch (e) {
                console.error('Erro ao formatar timestamp:', isoString, e);
                return isoString; // Retorna o original se houver erro
            }
        }

        /**
         * Cria um card HTML para exibir um sinal.
         * @param {object} signal - O objeto SignalData.
         * @returns {string} O HTML do card.
         */
        function createSignalCard(signal) {
            const formattedTimestamp = formatTimestamp(signal.timestamp);
            const metadataJson = JSON.stringify(signal.metadata, null, 2); // Formata JSON com indentação

            return `
                <div class="bg-darkcard p-4 rounded-lg shadow-lg border border-gray-700">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm text-gray-400">${formattedTimestamp}</span>
                        <span class="px-2 py-1 bg-secondary text-white text-xs font-semibold rounded-full">${signal.type}</span>
                    </div>
                    <h3 class="text-lg font-bold text-primary mb-2">Sinal ID: ${signal.id.substring(0, 8)}...</h3>
                    <p class="text-gray-300 mb-2">Valor: <span class="font-mono text-yellow-300">${signal.value}</span></p>
                    <div class="mt-3">
                        <p class="text-gray-400 text-sm mb-1">Metadados:</p>
                        <pre class="bg-gray-800 p-3 rounded-md overflow-x-auto text-xs text-green-300"><code class="language-json">${metadataJson}</code></pre>
                    </div>
                </div>
            `;
        }

        /**
         * Busca os sinais da API e atualiza o feed.
         */
        async function fetchSignals() {
            loadingMessage.classList.remove('hidden');
            signalsFeed.innerHTML = ''; // Limpa o feed antes de carregar novos dados
            updateSystemStatus(true); // Assume online antes de tentar buscar

            try {
                const response = await fetch(API_HISTORY_URL);
                if (!response.ok) {
                    throw new Error(\`HTTP error! status: \${response.status}\`);
                }
                const signals = await response.json();
                
                if (signals.length === 0) {
                    signalsFeed.innerHTML = '<p class="text-gray-400 text-center">Nenhum sinal encontrado no histórico.</p>';
                } else {
                    signalsFeed.innerHTML = signals.map(createSignalCard).join('');
                }
                updateSystemStatus(true);
            } catch (error) {
                console.error('Erro ao buscar sinais:', error);
                signalsFeed.innerHTML = '<p class="text-red-400 text-center">Erro ao carregar o histórico de sinais. Verifique a conexão com o servidor.</p>';
                updateSystemStatus(false);
            } finally {
                loadingMessage.classList.add('hidden');
            }
        }

        // Event Listeners
        refreshButton.addEventListener('click', fetchSignals);

        // Carrega os sinais ao iniciar e configura o auto-refresh
        document.addEventListener('DOMContentLoaded', () => {
            fetchSignals();
            setInterval(fetchSignals, 10000); // Auto-refresh a cada 10 segundos
        });
    </script>
</body>
</html>
EOF
echo "✅ 'index.html' criado/sobrescrito com o Dashboard."

echo "SPRINT 7 concluída com sucesso! Verifique os arquivos atualizados."
echo "Para iniciar o servidor, certifique-se de ter as dependências instaladas (npm install) e execute o arquivo principal (ex: node dist/main.js)."
echo "O Dashboard estará disponível em http://localhost:<PORTA_DO_SERVIDOR>/index.html"
```
