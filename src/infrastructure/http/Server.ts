import express, { Request, Response } from 'express';
import multer from 'multer';
import { GeminiAdapter } from '../ai/GeminiAdapter';
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
        
        this.app.post('/api/vision/analyze', this.upload.single('image'), async (req: any, res: Response) => {
            try {
                const base64 = req.file ? req.file.buffer.toString('base64') : req.body.image_base64;
                const mime = req.file ? req.file.mimetype : (req.body.image_mime_type || 'image/jpeg');
                
                const result = await this.geminiAdapter.generateVisionContent("Analise esta imagem", base64, mime);
                
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
        this.app.get('/health', (req, res) => res.send('OK'));
    }

    public start(): void {
        this.app.listen(this.port, this.host, () => console.log(`Server ON: ${this.host}:${this.port}`));
    }
    public async stop(): Promise<void> { console.log('Server stopping...'); }
}
