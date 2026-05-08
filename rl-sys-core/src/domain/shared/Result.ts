/**
 * @file Result.ts
 * @description Implements the Result type for robust error handling,
 *              following the Railway-Oriented Programming pattern.
 */

/**
 * Represents a computation that can either succeed with a value of type T
 * or fail with an error of type E.
 * @template T The type of the successful value.
 * @template E The type of the error.
 */
export type Result<T, E extends Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Creates a successful Result.
 * @template T The type of the successful value.
 * @template E The type of the error (inferred or explicitly provided).
 * @param value The successful value.
 * @returns A Result object indicating success.
 */
export const ok = <T, E extends Error>(value: T): Result<T, E> => ({ success: true, value });

/**
 * Creates a failed Result.
 * @template T The type of the successful value (inferred or explicitly provided).
 * @template E The type of the error.
 * @param error The error object.
 * @returns A Result object indicating failure.
 */
export const err = <T, E extends Error>(error: E): Result<T, E> => ({ success: false, error });

/**
 * Custom error class for domain-specific errors.
 */
export class DomainError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'DomainError';
    Object.setPrototypeOf(this, DomainError.prototype);
  }
}
