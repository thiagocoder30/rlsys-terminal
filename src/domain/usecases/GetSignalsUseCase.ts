/**
 * @file GetSignalsUseCase.ts
 * @description Defines the use case for retrieving signals from the history buffer.
 */

import { Signal } from '@domain/entities/Signal';
import { IHistoryBuffer } from '@domain/interfaces/IHistoryBuffer';

/**
 * Use case responsible for fetching all available signals from the history buffer.
 * This class encapsulates the business logic for retrieving signals,
 * abstracting away the details of how signals are stored.
 */
export class GetSignalsUseCase {
  private readonly historyBuffer: IHistoryBuffer;

  /**
   * Creates an instance of GetSignalsUseCase.
   * @param historyBuffer The history buffer implementation to retrieve signals from.
   */
  constructor(historyBuffer: IHistoryBuffer) {
    this.historyBuffer = historyBuffer;
  }

  /**
   * Executes the use case to retrieve all signals.
   * @returns An array of Signal objects.
   */
  public execute(): Signal[] {
    return this.historyBuffer.getSignals();
  }
}
