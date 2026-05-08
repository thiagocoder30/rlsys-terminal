import { IGeminiAdapter } from '../interfaces/IGeminiAdapter';

export class ImageAnalysisService {
  constructor(private geminiAdapter: IGeminiAdapter) {}

  async analyze(prompt: string, base64Image: string, mimeType: string): Promise<string> {
    // Prompt "System Instruction" para garantir precisão cirúrgica
    const enterprisePrompt = `
      CONTEXTO: Software de análise estatística de roleta.
      TAREFA: OCR de alta precisão em histórico de números.
      INSTRUÇÃO: 
      1. Localize a coluna ou linha de números sorteados.
      2. Extraia a sequência numérica.
      3. Remova qualquer caractere que não seja número ou vírgula.
      4. Retorne APENAS a sequência. Ex: 32,5,11,0,23.
      PROMPT DO USUÁRIO: ${prompt}
    `;

    try {
      const result = await this.geminiAdapter.analyzeImage(
        base64Image, 
        mimeType, 
        enterprisePrompt
      );

      // Limpeza final para garantir que o retorno seja puramente os dados
      return result.trim();
    } catch (error: any) {
      throw new Error(`Vision Engine Failure: ${error.message}`);
    }
  }
}
