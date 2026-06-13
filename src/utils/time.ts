// Format a Date as "YYYY-MM-DD HH:MM:SS" (local time), matching the
// created_at format used by biji's notes-list API so timestamps compare
// correctly as plain strings.
export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
