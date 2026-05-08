/**
 * @file HistoryBuffer.ts
 * @description Implements an in-memory history buffer for signals.
 */

import { Signal } from '@domain/entities/Signal';
import { IHistoryBuffer } from '@domain/interfaces/IHistoryBuffer';

/**
 * An in-memory implementation of IHistoryBuffer.
 * It stores a fixed number of the most recent signals.
 */
export class HistoryBuffer implements IHistoryBuffer {
  private readonly buffer: Signal[];
  private readonly capacity: number;

  /**
   * Creates an instance of HistoryBuffer.
   * @param capacity The maximum number of signals the buffer can hold.
   *                 Defaults to 100 if not provided or invalid.
   */
  constructor(capacity: number = 100) {
    if (capacity <= 0) {
      console.warn();
      this.capacity = 100;
    } else {
      this.capacity = capacity;
    }
    this.buffer = [];
  }

  /**
   * Adds a new signal to the buffer.
   * If the buffer exceeds its capacity, the oldest signal is removed.
   * @param signal The signal to be added.
   */
  public addSignal(signal: Signal): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift(); // Remove the oldest signal
    }
    this.buffer.push(signal);
  }

  /**
   * Retrieves all signals currently stored in the buffer.
   * Returns a shallow copy to prevent external modification of the internal buffer.
   * @returns An array of signals.
   */
  public getSignals(): Signal[] {
    return [...this.buffer]; // Return a copy to maintain encapsulation
  }
}
