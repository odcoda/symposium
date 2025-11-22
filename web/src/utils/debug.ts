export const assert = (condition: unknown, message = 'Assertion failed') => {
  if (!condition) throw new Error(message)
}