export function toIso(timestamp: number) {
  return new Date(timestamp).toISOString();
}
