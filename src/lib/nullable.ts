/**
 * Represents a nullable value.
 */
export type Nullable<T> = null | undefined | T;

/**
 * Represents a nested non-nullable value.
 */
export type NestedNonNullable<T> = NonNullable<{
  [K in keyof T]: T[K] extends object ? NestedNonNullable<T[K]> : NonNullable<T[K]>
}>

/**
 * Checks if a value is nullable.
 * @param value - The value to check.
 * @returns True if the value is nullable, false otherwise.
 */
export const isNonNullable = <T>(value: T): value is NonNullable<T> => {
  return value !== null && value !== undefined;
};

/**
 * Checks if a value is nullable.
 * @param value - The value to check.
 * @returns True if the value is nullable, false otherwise.
 */
export const isNullish = <T>(value: Nullable<T>): value is null | undefined => {
  return value === null || value === undefined;
};
