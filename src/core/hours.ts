// Customer service agent hours, in Botswana time (about-kopano.txt):
//   Mon–Fri 08:00–17:00, Sat 08:30–13:00, closed Sundays (public holidays not modelled yet).
// Netlify Functions run in UTC, so every calculation converts to Africa/Gaborone (UTC+2, no DST).

const BOTSWANA_OFFSET_MINUTES = 120;

// Opening windows per weekday (0 = Sunday), in minutes after midnight, Botswana time.
const AGENT_HOURS: Record<number, { open: number; close: number } | undefined> = {
  1: { open: 8 * 60, close: 17 * 60 },
  2: { open: 8 * 60, close: 17 * 60 },
  3: { open: 8 * 60, close: 17 * 60 },
  4: { open: 8 * 60, close: 17 * 60 },
  5: { open: 8 * 60, close: 17 * 60 },
  6: { open: 8 * 60 + 30, close: 13 * 60 },
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The same instant, shifted so its UTC fields read as Botswana wall-clock time. */
function toBotswanaClock(instant: Date): Date {
  return new Date(instant.getTime() + BOTSWANA_OFFSET_MINUTES * 60_000);
}

export function isWithinAgentHours(instant: Date): boolean {
  const local = toBotswanaClock(instant);
  const window = AGENT_HOURS[local.getUTCDay()];
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return window !== undefined && minutes >= window.open && minutes < window.close;
}

/** Human-readable next opening, e.g. "Monday at 08:00". Only meaningful outside agent hours. */
export function nextAgentAvailability(instant: Date): string {
  const local = toBotswanaClock(instant);
  const minutesNow = local.getUTCHours() * 60 + local.getUTCMinutes();

  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const day = (local.getUTCDay() + daysAhead) % 7;
    const window = AGENT_HOURS[day];
    if (!window) continue;
    if (daysAhead === 0 && minutesNow >= window.open) continue; // today's opening has passed
    const hh = String(Math.floor(window.open / 60)).padStart(2, "0");
    const mm = String(window.open % 60).padStart(2, "0");
    const dayLabel = daysAhead === 0 ? "today" : daysAhead === 1 ? "tomorrow" : DAY_NAMES[day];
    return `${dayLabel} at ${hh}:${mm}`;
  }
  return "the next business day";
}
