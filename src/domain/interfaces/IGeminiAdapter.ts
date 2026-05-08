export interface IGeminiAdapter {
  analyzeImage(imageData: string | Buffer, mimeType: string, prompt?: string): Promise<string>;
}
