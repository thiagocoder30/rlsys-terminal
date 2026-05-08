/**
 * @file Server.ts
 * @description Configures and starts the HTTP server using Express.
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import multer from 'multer'; // Import multer for error handling middleware
import { SignalController } from '@application/controllers/SignalController';
import { VisionController } from '@application/controllers/VisionController';

/**
 * Custom error handler for Multer errors.
 * @param err The error object.
 * @param _req The Express request object.
 * @param res The Express response object.
 * @param next The next middleware function.
 */
const multerErrorHandler = (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'File too large. Max 5MB allowed.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Unexpected file field.' });
    }
    return res.status(400).json({ message: err.message });
  } else if (err) {
    // Other errors from fileFilter, etc.
    return res.status(400).json({ message: err.message });
  }
  next();
};

/**
 * The Server class encapsulates the Express application setup and routing.
 * It depends on controllers to handle specific API logic, adhering to the
 * Dependency Inversion Principle.
 */
export class Server {
  private readonly app: Application;
  private readonly signalController: SignalController;
  private readonly visionController: VisionController;

  /**
   * Creates an instance of Server.
   * @param signalController The controller for signal-related endpoints.
   * @param visionController The controller for vision-related endpoints.
   */
  constructor(
    signalController: SignalController,
    visionController: VisionController
  ) {
    this.app = express();
    this.signalController = signalController;
    this.visionController = visionController;
    this.configureMiddleware();
    this.configureRoutes();
  }

  /**
   * Configures global middleware for the Express application.
   */
  private configureMiddleware(): void {
    this.app.use(express.json()); // For parsing application/json
    this.app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded
    // Add other global middleware here (e.g., logging, CORS)
  }

  /**
   * Configures the API routes and associates them with controller methods.
   */
  private configureRoutes(): void {
    // Signal Endpoints
    this.app.get('/api/signals', this.signalController.getSignals);
    this.app.post('/api/process', this.signalController.processSignals);

    // Vision Endpoints
    this.app.post(
      '/api/vision/analyze',
      this.visionController.uploadMiddleware, // Multer middleware for file upload
      multerErrorHandler, // Custom error handler for Multer specific errors
      this.visionController.analyzeImage
    );

    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
    });

    // Catch-all for undefined routes
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ message: 'Not Found' });
    });

    // Global error handler (should be the last middleware)
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Global error handler caught:', err.stack);
      res.status(500).json({ message: 'Internal Server Error', error: err.message });
    });
  }

  /**
   * Starts the HTTP server on the specified port and host.
   * @param port The port number to listen on.
   * @param host The host address to bind to.
   */
  public start(port: number, host: string): void {
    this.app.listen(port, host, () => {
      console.log();
    });
  }
}
