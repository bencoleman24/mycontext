/** Current instant as an ISO 8601 datetime string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Today's date as YYYY-MM-DD, in the local timezone (not UTC). This is a
 * local-first, single-machine tool, so the process's local time is the
 * user's time -- using UTC here would attribute evening check-ins to the
 * wrong calendar day for anyone west of UTC.
 */
export function todayDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Yesterday's date as YYYY-MM-DD, given a YYYY-MM-DD date string. */
export function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The Monday (ISO week start) of the week containing the given YYYY-MM-DD date. */
export function startOfWeek(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

/** The 1st of the month containing the given YYYY-MM-DD date. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
