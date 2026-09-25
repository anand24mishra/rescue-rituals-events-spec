import { describe,it,expect } from 'vitest';
import { toDateTimeLocal,fromDateTimeLocal,resolveEventTime,validTimeZone } from './event-time';
import {formatTimeRange} from './format';
import {returnPath} from './journey';
describe('event timezone editing',()=>{
 it('shows New York wall time independent of the browser zone',()=>{expect(toDateTimeLocal('2026-09-28T00:08:35.123Z','America/New_York')).toBe('2026-09-27T20:08');});
 it('converts a New York wall time back to its instant',()=>{expect(fromDateTimeLocal('2026-09-27T20:08','America/New_York')).toBe('2026-09-28T00:08:00Z');});
 it('converts India wall time consistently',()=>{expect(fromDateTimeLocal('2026-09-28T05:38','Asia/Kolkata')).toBe('2026-09-28T00:08:00Z');});
 it('retains seconds on an unchanged edit',()=>{const iso='2026-09-28T00:08:35.123Z';expect(resolveEventTime('2026-09-27T20:08','America/New_York',{iso,timezone:'America/New_York'})).toBe(iso);});
 it('rejects missing spring-forward times',()=>{expect(()=>fromDateTimeLocal('2026-03-08T02:30','America/New_York')).toThrow();});
 it('rejects ambiguous fall-back times for new inputs',()=>{expect(()=>fromDateTimeLocal('2026-11-01T01:30','America/New_York')).toThrow();});
 it('preserves an existing unmodified ambiguous instant',()=>{const iso='2026-11-01T06:30:00Z';expect(resolveEventTime('2026-11-01T01:30','America/New_York',{iso,timezone:'America/New_York'})).toBe(iso);});
 it('validates zones and malformed values',()=>{expect(validTimeZone('Invalid/Zone')).toBe(false);expect(validTimeZone('')).toBe(false);expect(()=>fromDateTimeLocal('bad','UTC')).toThrow();});
 it('shows the end date for an overnight event',()=>{expect(formatTimeRange('2026-09-28T00:00Z','2026-09-28T06:00Z','America/New_York')).toContain('Mon, Sep 28');});
});
describe('auth destination',()=>{
 it('keeps event and organizer routes including filters',()=>{expect(returnPath({from:'/events/abc'})).toBe('/events/abc');expect(returnPath({from:'/organizer/events?view=drafts'})).toBe('/organizer/events?view=drafts');});
 it.each(['//example.com','https://example.com','/login','/events\\evil','/events-other','/events/\nunsafe'])('rejects unsafe destination %s',from=>{expect(returnPath({from})).toBe('/events');});
});
