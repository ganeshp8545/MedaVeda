// Postgres/Supabase columns are snake_case; our TS types stay camelCase
// (unchanged from the Firestore version) so the rest of the app - hooks,
// components, pages - didn't need to change at all.

export function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    out[snakeKey] = obj[key];
  }
  return out;
}

export function toCamelCase<T = any>(obj: Record<string, any>): T {
  const out: Record<string, any> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
    out[camelKey] = obj[key];
  }
  return out as T;
}
