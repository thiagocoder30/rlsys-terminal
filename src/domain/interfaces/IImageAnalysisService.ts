/**
 * @file IImageAnalysisService.ts
 * @description Defines the contract for a service that performs image analysis.
 */

import { Result, DomainError } from '@domain/shared/Result';

/**
 * Represents the interface for a service that provides image analysis capabilities.
 * This service acts as a high-level abstraction for image processing,
 * decoupling the application from the specific underlying image analysis tools or APIs.
 */
export interface IImageAnalysisService {
  /**
   * Analyzes an image provided as a Buffer.
   * @param prompt A text prompt to guide the image analysis.
   * @param imageBuffer The image data as a Node.js Buffer.
   * @param mimeType The MIME type of the image (e.g., 'image/jpeg', 'image/png').
   * @returns A Promise that resolves to a Result indicating success with the analysis
   *          result (string) or failure with a DomainError.
   */
  analyze(
    prompt: string,
    imageBuffer: Buffer,
    mimeType: string
  ): Promise<Result<string, DomainError>>;
}
