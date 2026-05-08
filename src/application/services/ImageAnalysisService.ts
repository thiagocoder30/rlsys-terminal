import { IGeminiAdapter } from '../../domain/interfaces/IGeminiAdapter';

export class ImageAnalysisService {
  constructor(private geminiAdapter: IGeminiAdapter) {}

  public async analyzeImage(prompt: string, base64Image: string, mimeType: string): Promise<string> {
    // Garante que o buffer da imagem seja o primeiro argumento conforme contrato
    return await this.geminiAdapter.analyzeImage(base64Image, mimeType, prompt);
  }
}
