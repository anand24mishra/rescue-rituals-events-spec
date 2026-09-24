import { parseDurationToSeconds } from './auth.service';

describe('parseDurationToSeconds', () => {
  it('converts the duration suffixes @nestjs/jwt accepts', () => {
    expect(parseDurationToSeconds('30s')).toBe(30);
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('1h')).toBe(3600);
    expect(parseDurationToSeconds('7d')).toBe(604_800);
  });

  it('treats a bare number as seconds, as jsonwebtoken does', () => {
    expect(parseDurationToSeconds('3600')).toBe(3600);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseDurationToSeconds('  2h  ')).toBe(7200);
  });

  it('reports 0 for an unparseable value rather than inventing a number', () => {
    // A client must never refresh on a figure this code guessed at.
    expect(parseDurationToSeconds('1 fortnight')).toBe(0);
    expect(parseDurationToSeconds('')).toBe(0);
    expect(parseDurationToSeconds('abc')).toBe(0);
  });
});
