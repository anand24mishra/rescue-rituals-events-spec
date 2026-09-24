import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('produces an Argon2id hash, never the plaintext', async () => {
    const hash = await passwords.hash('correct-horse-battery-staple');

    expect(hash).not.toContain('correct-horse-battery-staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('salts each hash, so identical passwords do not collide', async () => {
    const [first, second] = await Promise.all([
      passwords.hash('same-password-twice'),
      passwords.hash('same-password-twice'),
    ]);

    expect(first).not.toBe(second);
    expect(await passwords.verify(first, 'same-password-twice')).toBe(true);
    expect(await passwords.verify(second, 'same-password-twice')).toBe(true);
  });

  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await passwords.hash('the-right-password');

    expect(await passwords.verify(hash, 'the-right-password')).toBe(true);
    expect(await passwords.verify(hash, 'the-wrong-password')).toBe(false);
  });

  it('returns false for a corrupt stored hash instead of throwing', async () => {
    // A corrupt row should fail one login, not surface as a 500 that
    // distinguishes "broken record" from "wrong password".
    expect(await passwords.verify('not-a-hash', 'anything')).toBe(false);
    expect(await passwords.verify('', 'anything')).toBe(false);
  });
});
