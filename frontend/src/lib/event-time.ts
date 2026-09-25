import { Temporal } from '@js-temporal/polyfill';

/** Wall-clock fields always correspond to the zone displayed beside them. */
export function toDateTimeLocal(iso: string, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  return Temporal.Instant.from(iso).toZonedDateTimeISO(timezone).toPlainDateTime().toString({smallestUnit: 'minute'});
}

export function fromDateTimeLocal(value: string, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone, {disambiguation: 'reject'}).toInstant().toString();
}

export function validTimeZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en', {timeZone: zone}).format(); return zone.length > 0; }
  catch { return false; }
}

/** Preserve seconds and the exact instant on unchanged edits, including DST overlaps. */
export function resolveEventTime(value: string, timezone: string, original?: {iso:string; timezone:string}): string {
  if (original && original.timezone === timezone && toDateTimeLocal(original.iso,timezone) === value) return original.iso;
  return fromDateTimeLocal(value,timezone);
}
