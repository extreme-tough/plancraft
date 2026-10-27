/** "Today" is the date on the user's device (EM-55), as YYYY-MM-DD. Client-side only. */
export function localToday(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
