export function warn(message: string, error: unknown): void {
  try {
    console.warn(message, error);
  } catch {}
}
