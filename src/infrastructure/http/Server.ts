import express, { Request, Response } from 'express';
import multer from 'multer';
import { GeminiAdapter } from '../adapters/GeminiAdapter';
import { ISignalRepository } from '../../domain/math/ISignalRepository';

export class Server {
    private app: express.Application;
    private upload: multer.Multer;

    constructor(
        private port: number,
        private host: string,
        private geminiAdapter: GeminiAdapter,
        private signalRepository: ISignalRepository
    ) {
        this.app = express();
        this.upload = multer({ storage: multer.memoryStorage() });
        this.setupRoutes();
    }

    private setupRoutes(): void {
        this.app.use(express.json());
        this.app.use(express.static("."));

        this.app.get('/api/history', async (req, res) => {
            const history = await this.signalRepository.getHistory(10);
            res.json(history);
        });

        this.app.post('/api/vision/analyze', this.upload.single('image'), async (req: any, res: Response) => {
            try {
                const base64 = req.file ? req.file.buffer.toString('base64') : req.body.image_base64;
                const mime = req.file ? req.file.mimetype : (req.body.image_mime_type || 'image/jpeg');
                if (!base64) { res.status(400).json({ error: "Missing image" }); return; }

                const result = await this.geminiAdapter.analyzeImage(base64, mime, "Extraia os números do histórico de roleta. Retorne APENAS um JSON puro, sem markdown, no formato { \"total\": number, \"sequencia\": [number] }");
                await this.signalRepository.saveSignal({
                    type: 'vision_analysis',
                    value: 'image_data',
                    timestamp: Date.now(),
                    analysis: result
                });
                res.status(200).json({ analysis: result });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    public start(): void {
        this.app.listen(this.port, this.host, () => console.log(`[SYS] Server ON: ${this.host}:${this.port}`));
    }
    public async stop(): Promise<void> { console.log('[SYS] Server Stopping...'); }
}
