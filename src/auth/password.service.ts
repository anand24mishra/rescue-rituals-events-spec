import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing, isolated behind one interface so the algorithm and its
 * parameters are changed in exactly one place.
 *
 * Argon2id is chosen over bcrypt because it resists GPU and ASIC cracking
 * better at comparable cost, and because it has no 72-byte input truncation.
 * Parameters follow the OWASP Password Storage baseline (19 MiB, 2 passes,
 * 1 degree of parallelism) — enough to be expensive for an attacker holding a
 * stolen database, cheap enough for a login request.
 */
@Injectable()
export class PasswordService {
  private static readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, PasswordService.options);
  }

  /**
   * Returns false rather than throwing on a malformed stored hash: a corrupt
   * row should fail one login, not surface as a 500 that reveals the
   * difference between "wrong password" and "broken record".
   */
  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      return false;
    }
  }
}
