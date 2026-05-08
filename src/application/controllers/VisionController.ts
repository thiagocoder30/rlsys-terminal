import { Request, Response } from 'express';
import { ImageAnalysisService } from '../../domain/services/ImageAnalysisService';

export class VisionController {
  constructor(private imageAnalysisService: ImageAnalysisService) {}

  async handle(req: any, res: Response): Promise<void> {
    try {
      const base64Image = req.file ? req.file.buffer.toString('base64') : req.body.image_base64;
      const mimeType = req.file ? req.file.mimetype : (req.body.image_mime_type || 'image/jpeg');
      const prompt = req.body.prompt || 'Analise esta imagem';

      if (!base64Image) {
        res.status(400).json({ message: 'No image data provided.' });
        return;
      }

      const analysis = await this.imageAnalysisService.analyze(prompt, base64Image, mimeType);
      res.status(200).json({ analysis });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}
