// Human-friendly timestamps for version lists: relative for the recent past,
// absolute once "n days ago" stops being helpful.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(date: Date, now = new Date()): string {
  const delta = now.getTime() - date.getTime();
  if (delta < MINUTE) return "Just now";
  if (delta < HOUR) {
    const m = Math.floor(delta / MINUTE);
    return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  }
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR);
    return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  }
  if (delta < 7 * DAY) {
    const d = Math.floor(delta / DAY);
    return `${d} ${d === 1 ? "day" : "days"} ago`;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

// Full timestamp for timeline rows: "Jul 7, 9:43 PM", year only when it
// differs from today's.
export function absoluteTime(date: Date, now = new Date()): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
