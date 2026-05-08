/**
 * @file src/application/services/ImageAnalysisService.ts
 * @description Serviço de aplicação responsável por orquestrar a análise de imagens
 *              utilizando um adaptador de IA.
 *              Este serviço depende da interface IGeminiAdapter, não de uma implementação concreta.
 */

import { IGeminiAdapter } from '@domain/interfaces/IGeminiAdapter';

/**
 * @class ImageAnalysisService
 * @description Serviço que encapsula a lógica de negócio para análise de imagens.
 *              Ele utiliza um IGeminiAdapter para interagir com o modelo de IA subjacente.
 *              Adere ao Princípio da Inversão de Dependência (D do SOLID).
 */
export class ImageAnalysisService {
  private readonly geminiAdapter: IGeminiAdapter;

  /**
   * Construtor do ImageAnalysisService.
   * @param {IGeminiAdapter} geminiAdapter - Uma implementação da interface IGeminiAdapter.
   *                                         Permite a injeção de diferentes adaptadores de IA.
   */
  constructor(geminiAdapter: IGeminiAdapter) {
    this.geminiAdapter = geminiAdapter;
  }

  /**
   * Realiza a análise de uma imagem utilizando o adaptador de IA configurado.
   *
   * @param {string} prompt - O prompt de texto para guiar a análise da imagem.
   * @param {string} base64Image - A imagem codificada em Base64.
   * @param {string} mimeType - O tipo MIME da imagem (ex: 'image/jpeg', 'image/png').
   * @returns {Promise<string>} Uma promessa que resolve com o resultado da análise (texto gerado pela IA).
   *                            A promessa será rejeitada se ocorrer um erro durante a comunicação com a IA.
   * @throws {Error} Erros de comunicação ou processamento serão propagados.
   */
  public async analyzeImage(prompt: string, base64Image: string, mimeType: string): Promise<string> {
    if (!prompt || prompt.trim() === '') {
      throw new Error("O prompt não pode ser vazio para a análise da imagem.");
    }
    if (!base64Image || base64Image.trim() === '') {
      throw new Error("A imagem em Base64 não pode ser vazia para a análise.");
    }
    if (!mimeType || mimeType.trim() === '') {
      throw new Error("O tipo MIME da imagem não pode ser vazio.");
    }

    try {
      // Delega a chamada real ao adaptador, que lida com os detalhes da API externa.
      const analysisResult = await this.geminiAdapter.generateVisionContent(prompt, base64Image, mimeType);
      return analysisResult;
    } catch (error: any) {
      console.error(`Erro ao analisar imagem com Gemini Adapter: ${error.message}`, error);
      // Em um sistema de produção, considerar encapsular o erro em um tipo de erro de domínio
      // ou usar um padrão Result/Either para um tratamento mais explícito.
      throw new Error(`Falha na análise da imagem: ${error.message || 'Erro desconhecido'}`);
    }
  }
}
