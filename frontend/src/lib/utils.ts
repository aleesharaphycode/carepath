import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges CSS class names using clsx and tailwind-merge.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within `ms` milliseconds,
 * it throws an Error with the given `operationName`.
 */
export async function withTimeout<T>(promise: Promise<T> | PromiseLike<T>, ms: number, operationName: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${operationName} took longer than ${ms}ms`)), ms)
    ),
  ]);
}
