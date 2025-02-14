/**
 * Await a timeout within an async block. Duration in milliseconds.
 * 
 * ex.
 * ```
 * const doSomething = async () => {
 *    await asyncTimeout(100);
 * };
 * ```
 * 
 * @pumposh
 */
export const asyncTimeout = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(() => resolve(), ms);
    });
  