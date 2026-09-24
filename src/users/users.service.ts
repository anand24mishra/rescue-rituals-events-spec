import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Email normalisation policy: trim, then lowercase.
   *
   * This is deliberately simple and deliberately documented. Case-folding the
   * local part is not correct for every mail server in the world, but for a
   * consumer product it prevents the far more common problem of one person
   * registering twice with `Anand@` and `anand@`. See docs/DATA_MODEL.md §3.
   */
  static normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: UsersService.normaliseEmail(email) },
    });
  }

  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email: UsersService.normaliseEmail(input.email),
        passwordHash: input.passwordHash,
      },
    });
  }
}
