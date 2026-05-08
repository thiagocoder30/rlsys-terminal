/**
 * @file ProcessSignalsUseCase.ts
 * @description Defines the use case for processing and storing new signals.
 */

import { v4 as uuidv4 } from 'uuid';
import { Signal } from '@domain/entities/Signal';
import { IHistoryBuffer } from '@domain/interfaces/IHistoryBuffer';

/**
 * Use case responsible for taking raw numerical values, converting them into Signal entities,
 * and storing them in the history buffer.
 * This class encapsulates the business logic for signal creation and storage.
 */
export class ProcessSignalsUseCase {
  private readonly historyBuffer: IHistoryBuffer;

  /**
   * Creates an instance of ProcessSignalsUseCase.
   * @param historyBuffer The history buffer implementation to store signals into.
   */
  constructor(historyBuffer: IHistoryBuffer) {
    this.historyBuffer = historyBuffer;
  }

  /**
   * Executes the use case to process an array of numerical values.
   * Each value is converted into a Signal entity with a unique ID and current timestamp,
   * and then added to the history buffer.
   * @param values An array of numbers to be processed as signals.
   */
  public execute(values: number[]): void {
    if (!Array.isArray(values)) {
      throw new Error('Input values must be an array.');
    }

    for (const value of values) {
      if (typeof value !== 'number' || isNaN(value)) {
        console.warn();
        continue; // Skip invalid values to prevent system failure
      }
      const signal = new Signal(uuidv4(), value);
      this.historyBuffer.addSignal(signal);
    }
  }
}
