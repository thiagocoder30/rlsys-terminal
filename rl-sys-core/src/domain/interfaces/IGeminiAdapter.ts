/**
 * @file IGeminiAdapter.ts
 * @description Defines the contract for an adapter to interact with the Gemini Vision API.
 */

import { Result, DomainError } from '@domain/shared/Result';

/**
 * Represents the interface for an adapter that communicates with the Gemini Vision API
 * or a similar image analysis service.
 * This abstraction ensures that the domain layer is decoupled from the specific
 * implementation details of the external API.
 */
export interface IGeminiAdapter {
  /**
   * Analyzes an image using the Gemini Vision API.
   * @param prompt A text prompt to guide the image analysis.
   * @param base64Image The image data encoded in Base64 format.
   * @param mimeType The MIME type of the image (e.g., 'image/jpeg', 'image/png').
   * @returns A Promise that resolves to a Result indicating success with the analysis
   *          result (string) or failure with a DomainError.
   */
  analyzeImage(
    prompt: string,
    base64Image: string,
    mimeType: string
  ): Promise<Result<string, DomainError>>;
}
