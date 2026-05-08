/**
 * @file IHistoryBuffer.ts
 * @description Defines the interface for a history buffer that stores signals.
 */

import { Signal } from '@domain/entities/Signal';

/**
 * Represents a contract for a history buffer responsible for storing and retrieving signals.
 * This interface ensures that the domain layer remains independent of the concrete storage implementation.
 */
export interface IHistoryBuffer {
  /**
   * Adds a new signal to the buffer.
   * @param signal The signal to be added.
   */
  addSignal(signal: Signal): void;

  /**
   * Retrieves all signals currently stored in the buffer.
   * @returns An array of signals.
   */
  getSignals(): Signal[];
}
