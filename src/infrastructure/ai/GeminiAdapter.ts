import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiAdapter {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Usando gemini-1.5-flash para melhor performance no Helio P22
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }

    async generateVisionContent(prompt: string, base64: string, mimeType: string): Promise<string> {
        try {
            const result = await this.model.generateContent([
                prompt,
                { inlineData: { data: base64, mimeType } }
            ]);
            const response = await result.response;
            return response.text();
        } catch (error: any) {
            throw new Error(`Erro na análise Gemini: ${error.message}`);
        }
    }
}
