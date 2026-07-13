export function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}
