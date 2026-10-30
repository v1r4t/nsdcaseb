const IST = "Asia/Kolkata";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type IStParts = { year: number; month: number; day: number };

function istParts(date: Date): IStParts {
  const parts = dayFormatter.formatToParts(date);
  const get = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function dayNumber(date: Date): number {
  const { year, month, day } = istParts(date);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** 1 on the founding day, incremented at IST midnight. */
export function dayCounter(foundedISO: string, now: Date = new Date()): number {
  const founded = new Date(foundedISO);
  if (Number.isNaN(founded.getTime())) return 1;
  return dayNumber(now) - dayNumber(founded) + 1;
}

/** "10:20" — always India Standard Time, whatever the machine thinks. */
export function formatClock(date: Date = new Date()): string {
  return clockFormatter.format(date);
}

/** The calendar year in India Standard Time — never the machine's timezone. */
export function yearOf(iso: string): number {
  return istParts(new Date(iso)).year;
}

/** "14 MAR 2025" */
export function formatDate(iso: string): string {
  const { year, month, day } = istParts(new Date(iso));
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

/** "14 MAR 2025 · 18:00 IST" — deadlines need a time, not just a day. */
export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatClock(new Date(iso))} IST`;
}

/** "14 – 16 MAR 2025", "30 MAR – 02 APR 2025", or a single date. */
export function formatDateRange(startISO: string, endISO: string): string {
  const a = istParts(new Date(startISO));
  const b = istParts(new Date(endISO));
  const dd = (n: number) => String(n).padStart(2, "0");
  if (a.year === b.year && a.month === b.month && a.day === b.day) return formatDate(startISO);
  if (a.year === b.year && a.month === b.month) {
    return `${dd(a.day)} – ${dd(b.day)} ${MONTHS[a.month - 1]} ${a.year}`;
  }
  if (a.year === b.year) {
    return `${dd(a.day)} ${MONTHS[a.month - 1]} – ${dd(b.day)} ${MONTHS[b.month - 1]} ${a.year}`;
  }
  return `${formatDate(startISO)} – ${formatDate(endISO)}`;
}
