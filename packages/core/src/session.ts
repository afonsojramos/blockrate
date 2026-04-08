export function hasCheckedThisSession(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function markChecked(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // Silently fail
  }
}

export function shouldSample(rate: number): boolean {
  return Math.random() < rate;
}
