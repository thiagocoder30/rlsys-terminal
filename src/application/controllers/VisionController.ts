/**
 * @file VisionController.ts
 * @description Handles HTTP requests related to vision analysis.
 */

import { Request, Response } from 'express';
import multer from 'multer';
import { IImageAnalysisService } from '@domain/interfaces/IImageAnalysisService';
import { DomainError } from '@domain/shared/Result';

// Configure Multer to use memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
});

/**
 * VisionController manages the API endpoints for image analysis.
 * It handles file uploads, delegates to the image analysis service,
 * and formats the responses.
 */
export class VisionController {
  private readonly imageAnalysisService: IImageAnalysisService;

  /**
   * Creates an instance of VisionController.
   * @param imageAnalysisService The service responsible for performing image analysis.
   */
  constructor(imageAnalysisService: IImageAnalysisService) {
    this.imageAnalysisService = imageAnalysisService;
  }

  /**
   * Middleware for handling single file upload.
   * This is exposed so the server can use it directly in the route definition.
   */
  public uploadMiddleware = upload.single('image');

  /**
   * Handles POST /api/vision/analyze requests.
   * Expects an image file in the 'image' field of a multipart/form-data request,
   * and a 'prompt' field in the body.
   * @param req The Express request object, containing the uploaded file and prompt.
   * @param res The Express response object.
   */
  public analyzeImage = async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    const prompt = req.body.prompt as string;

    if (!file) {
      return res.status(400).json({ message: 'No image file provided.' });
    }
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ message: 'Prompt is required and must be a non-empty string.' });
    }

    try {
      const analysisResult = await this.imageAnalysisService.analyze(
        prompt,
        file.buffer,
        file.mimetype
      );

      if (analysisResult.success) {
        res.status(200).json({ analysis: analysisResult.value });
      } else {
        const error = analysisResult.error;
        console.error('Image analysis failed:', error.message, error.code);
        if (error instanceof DomainError) {
          res.status(422).json({ message: error.message, code: error.code });
        } else {
          res.status(500).json({ message: 'Failed to analyze image due to an internal error.' });
        }
      }
    } catch (error) {
      console.error('Unexpected error in VisionController.analyzeImage:', error instanceof Error ? error.message : String(error));
      res.status(500).json({ message: 'An unexpected error occurred during image analysis.' });
    }
  };
}
