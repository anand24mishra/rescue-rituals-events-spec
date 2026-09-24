import { UsersService } from './users.service';

describe('UsersService.normaliseEmail', () => {
  it('trims and lowercases, so one person cannot register twice by casing', () => {
    expect(UsersService.normaliseEmail('  Anand@Example.COM ')).toBe(
      'anand@example.com',
    );
  });

  it('leaves an already-normalised address unchanged', () => {
    expect(UsersService.normaliseEmail('anand@example.com')).toBe(
      'anand@example.com',
    );
  });

  it('does not alter the local part beyond case', () => {
    expect(UsersService.normaliseEmail('first.last+tag@example.com')).toBe(
      'first.last+tag@example.com',
    );
  });
});
