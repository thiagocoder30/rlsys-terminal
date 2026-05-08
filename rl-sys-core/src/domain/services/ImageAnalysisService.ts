/**
 * @file ImageAnalysisService.ts
 * @description Implements the IImageAnalysisService using an IGeminiAdapter.
 */

import { IImageAnalysisService } from '@domain/interfaces/IImageAnalysisService';
import { IGeminiAdapter } from '@domain/interfaces/IGeminiAdapter';
import { Result, ok, err, DomainError } from '@domain/shared/Result';

/**
 * ImageAnalysisService provides the core business logic for analyzing images.
 * It orchestrates the conversion of image data and delegates the actual analysis
 * to an external adapter (e.g., GeminiAdapter).
 */
export class ImageAnalysisService implements IImageAnalysisService {
  private readonly geminiAdapter: IGeminiAdapter;

  /**
   * Creates an instance of ImageAnalysisService.
   * @param geminiAdapter The adapter responsible for communicating with the Gemini API.
   */
  constructor(geminiAdapter: IGeminiAdapter) {
    this.geminiAdapter = geminiAdapter;
  }

  /**
   * Analyzes an image by converting its Buffer data to Base64 and then
   * passing it to the Gemini adapter for processing.
   * @param prompt A text prompt for the analysis.
   * @param imageBuffer The image data as a Buffer.
   * @param mimeType The MIME type of the image.
   * @returns A Promise resolving to a Result with the analysis string or a DomainError.
   */
  public async analyze(
    prompt: string,
    imageBuffer: Buffer,
    mimeType: string
  ): Promise<Result<string, DomainError>> {
    if (!imageBuffer || imageBuffer.length === 0) {
      return err(new DomainError('Image buffer is empty.', 'IMAGE_ANALYSIS_EMPTY_BUFFER'));
    }
    if (!mimeType || !mimeType.startsWith('image/')) {
      return err(new DomainError('Invalid or missing image MIME type.', 'IMAGE_ANALYSIS_INVALID_MIMETYPE'));
    }
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return err(new DomainError('Prompt cannot be empty.', 'IMAGE_ANALYSIS_EMPTY_PROMPT'));
    }

    try {
      const base64Image = imageBuffer.toString('base64');
      const analysisResult = await this.geminiAdapter.analyzeImage(prompt, base64Image, mimeType);

      if (analysisResult.success) {
        return ok(analysisResult.value);
      } else {
        // Propagate the error from the adapter, potentially adding more context
        return err(new DomainError(
          ,
          analysisResult.error.code || 'IMAGE_ANALYSIS_ADAPTER_ERROR'
        ));
      }
    } catch (error) {
      console.error('Unexpected error during image analysis:', error);
      return err(new DomainError(
        ,
        'IMAGE_ANALYSIS_UNEXPECTED_ERROR'
      ));
    }
  }
}
