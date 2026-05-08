/**
 * @file src/domain/interfaces/IGeminiAdapter.ts
 * @description Contrato para adaptadores de serviços de IA, como o Gemini Vision.
 *              Define a interface que qualquer implementação de adaptador deve seguir,
 *              garantindo a inversão de dependência e a modularidade.
 */

/**
 * @interface IGeminiAdapter
 * @description Define o contrato para um adaptador que interage com o serviço Gemini
 *              para gerar conteúdo baseado em visão (imagem + prompt).
 *              Este contrato garante que a camada de aplicação dependa de uma abstração,
 *              não de uma implementação concreta.
 */
export interface IGeminiAdapter {
  /**
   * Gera conteúdo (texto) a partir de um prompt e uma imagem.
   *
   * @param {string} prompt - O prompt de texto a ser enviado ao modelo de IA.
   * @param {string} base64Image - A imagem codificada em Base64.
   * @param {string} mimeType - O tipo MIME da imagem (ex: 'image/jpeg', 'image/png').
   * @returns {Promise<string>} Uma promessa que resolve com o conteúdo gerado pelo modelo de IA.
   *                            Em caso de erro, a promessa será rejeitada.
   * @throws {Error} Implementações devem tratar e propagar erros de forma robusta.
   */
  generateVisionContent(prompt: string, base64Image: string, mimeType: string): Promise<string>;
}
