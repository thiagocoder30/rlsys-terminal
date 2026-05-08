/**
 * @file SignalController.ts
 * @description Handles HTTP requests related to signal data.
 */

import { Request, Response } from 'express';
import { SignalOrchestrator } from '@application/orchestrators/SignalOrchestrator';
import { GetSignalsUseCase } from '@domain/usecases/GetSignalsUseCase';

/**
 * SignalController manages the API endpoints for signal data.
 * It translates HTTP requests into calls to application orchestrators and use cases,
 * and formats their responses back into HTTP responses.
 */
export class SignalController {
  private readonly signalOrchestrator: SignalOrchestrator;
  private readonly getSignalsUseCase: GetSignalsUseCase;

  /**
   * Creates an instance of SignalController.
   * @param signalOrchestrator The orchestrator for processing incoming signals.
   * @param getSignalsUseCase The use case for retrieving existing signals.
   */
  constructor(
    signalOrchestrator: SignalOrchestrator,
    getSignalsUseCase: GetSignalsUseCase
  ) {
    this.signalOrchestrator = signalOrchestrator;
    this.getSignalsUseCase = getSignalsUseCase;
  }

  /**
   * Handles GET /api/signals requests.
   * Retrieves all signals from the history buffer.
   * @param _req The Express request object (unused).
   * @param res The Express response object.
   */
  public getSignals = (_req: Request, res: Response): void => {
    try {
      const signals = this.getSignalsUseCase.execute();
      res.status(200).json(signals);
    } catch (error) {
      console.error('Error fetching signals:', error instanceof Error ? error.message : String(error));
      res.status(500).json({ message: 'Failed to retrieve signals.' });
    }
  };

  /**
   * Handles POST /api/process requests.
   * Injects new numerical values into the signal history buffer via the orchestrator.
   * @param req The Express request object, expecting a JSON body with a 'values' array.
   * @param res The Express response object.
   */
  public processSignals = (req: Request, res: Response): void => {
    const { values } = req.body;

    if (!Array.isArray(values) || !values.every(v => typeof v === 'number')) {
      return res.status(400).json({ message: 'Invalid input: "values" must be an array of numbers.' });
    }

    try {
      this.signalOrchestrator.process(values);
      res.status(202).json({ message: 'Signals accepted for processing.' });
    } catch (error) {
      console.error('Error processing incoming signals:', error instanceof Error ? error.message : String(error));
      res.status(500).json({ message: 'Failed to process signals.' });
    }
  };
}
