/**
 * Date, time and attendance formatting.
 *
 * Design.md §34 asks for human language first: "Saturday, October 10" and
 * "2:00–6:00 PM" rather than an ISO string or a percentage. Relative time is
 * offered alongside the real date, never instead of it.
 *
 * An event happens at a place, so times are rendered in the event's own IANA
 * zone when one is recorded. Telling somebody in London that a Brooklyn
 * adoption fair starts at 7pm their time is accurate and useless.
 */

const zoneOf = (timezone: string | null): string | undefined =>
  timezone !== null && timezone.length > 0 ? timezone : undefined;

/** "Saturday, October 10" */
export function formatEventDate(iso: string, timezone: string | null): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: zoneOf(timezone),
  }).format(new Date(iso));
}

/** "Sat, Oct 10" — for compact rows where the full form would wrap. */
export function formatEventDateShort(iso: string, timezone: string | null): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: zoneOf(timezone),
  }).format(new Date(iso));
}

/** "2:00–6:00 PM", collapsing a shared meridiem the way a person would write it. */
export function formatTimeRange(
  startsAt: string,
  endsAt: string,
  timezone: string | null,
): string {
  const zone = zoneOf(timezone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone,
  });

  const start = formatter.format(new Date(startsAt));
  const end = formatter.format(new Date(endsAt));

  const startMeridiem = start.slice(-2);
  const endMeridiem = end.slice(-2);

  // "2:00–6:00 PM" reads better than "2:00 PM–6:00 PM" when both are PM.
  const day = new Intl.DateTimeFormat('en-CA', {year:'numeric', month:'2-digit', day:'2-digit', timeZone: zone});
  if (day.format(new Date(startsAt)) !== day.format(new Date(endsAt))) {
    return `${start}–${formatEventDateShort(endsAt, timezone)}, ${end}`;
  }

  if (startMeridiem === endMeridiem) {
    return `${start.slice(0, -3)}–${end}`;
  }
  return `${start}–${end}`;
}

/** Short zone name such as "EDT". Empty when the event records no zone. */
export function formatZone(iso: string, timezone: string | null): string {
  const zone = zoneOf(timezone);
  // Explicitly identify browser-local times when the event has no recorded zone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'short',
  }).formatToParts(new Date(iso));
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

/**
 * "Starts in 2 days" / "Started 3 hours ago".
 *
 * Always shown next to the real date, never as a replacement (§34).
 */
export function formatRelative(iso: string, now: number): string {
  const diffMs = new Date(iso).getTime() - now;
  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  const absMs = Math.abs(diffMs);

  const value = (unit: Intl.RelativeTimeFormatUnit, ms: number) =>
    formatter.format(Math.round(diffMs / ms), unit);

  if (absMs >= 86_400_000) return capitalise(value('day', 86_400_000));
  if (absMs >= 3_600_000) return capitalise(value('hour', 3_600_000));
  return capitalise(value('minute', 60_000));
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * "72 confirmed · 28 spots left", in words rather than a percentage (§34).
 */
export function formatAttendance(
  confirmedCount: number,
  capacity: number | null,
): string {
  if (capacity === null) {
    return `${confirmedCount} ${confirmedCount === 1 ? 'person' : 'people'} confirmed`;
  }

  const remaining = Math.max(0, capacity - confirmedCount);
  if (remaining === 0) return `${confirmedCount} confirmed · Event full`;

  return `${confirmedCount} confirmed · ${remaining} spot${remaining === 1 ? '' : 's'} left`;
}

