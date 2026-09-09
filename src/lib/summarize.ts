/** Rough token estimate: ~4 characters per token. */
export function estimatedTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
