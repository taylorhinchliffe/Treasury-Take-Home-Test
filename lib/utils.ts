export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Simple deep clone for our small data objects
export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
