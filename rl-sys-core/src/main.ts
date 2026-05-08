/**
 * @file main.ts
 * @description The application's entry point and composition root.
 *              Responsible for dependency injection and starting the server.
 */

// Domain Layer Imports
import { HistoryBuffer } from '@infrastructure/repositories/HistoryBuffer';
import { GetSignalsUseCase } from '@domain/usecases/GetSignalsUseCase';
import { ProcessSignalsUseCase } from '@domain/usecases/ProcessSignalsUseCase';
import { ImageAnalysisService } from '@domain/services/ImageAnalysisService';

// Infrastructure Layer Imports
import { GeminiAdapter } from '@infrastructure/adapters/GeminiAdapter';
import { Server } from '@infrastructure/http/Server';

// Application Layer Imports
import { SignalOrchestrator } from '@application/orchestrators/SignalOrchestrator';
import { SignalController } from '@application/controllers/SignalController';
import { VisionController } from '@application/controllers/VisionController';

/**
 * Main function to set up the application, inject dependencies, and start the server.
 */
async function bootstrap(): Promise<void> {
  // --- Infrastructure Layer Instantiations ---
  const historyBuffer = new HistoryBuffer(100); // Capacity of 100 signals
  const geminiAdapter = new GeminiAdapter();

  // --- Domain Layer Instantiations (Use Cases & Services) ---
  const getSignalsUseCase = new GetSignalsUseCase(historyBuffer);
  const processSignalsUseCase = new ProcessSignalsUseCase(historyBuffer);
  const imageAnalysisService = new ImageAnalysisService(geminiAdapter);

  // --- Application Layer Instantiations (Orchestrators & Controllers) ---
  const signalOrchestrator = new SignalOrchestrator(processSignalsUseCase);
  const signalController = new SignalController(signalOrchestrator, getSignalsUseCase);
  const visionController = new VisionController(imageAnalysisService);

  // --- HTTP Server Setup ---
  const server = new Server(signalController, visionController);
  const PORT = 3000;
  const HOST = '0.0.0.0';

  server.start(PORT, HOST);
}

// Execute the bootstrap function
bootstrap().catch(error => {
  console.error('Failed to start the application:', error);
  process.exit(1);
});
