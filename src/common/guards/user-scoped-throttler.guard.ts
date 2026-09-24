import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Rate limiting keyed by authenticated user, falling back to client IP for
 * anonymous requests.
 *
 * The default IP-only tracker is wrong in both directions for an authenticated
 * API. It lets one account spread its traffic across addresses, and it makes
 * everyone behind a single egress IP — an office, a campus, a mobile carrier's
 * NAT — share one budget, so one person's retry loop locks out strangers.
 *
 * Anonymous requests still fall back to IP, since there is nothing better to
 * key on. `TRUST_PROXY` must be enabled in deployments that sit behind a load
 * balancer, or every request appears to come from the proxy.
 */
@Injectable()
export class UserScopedThrottlerGuard extends ThrottlerGuard {
  // The base signature is async; nothing here needs to await, so the value is
  // wrapped rather than the method being marked async for no reason.
  protected override getTracker(req: Request): Promise<string> {
    const user = req.user as AuthenticatedUser | undefined;
    if (user !== undefined) return Promise.resolve(`user:${user.id}`);

    // `req.ip` already respects Express's `trust proxy` setting, which is
    // configured from TRUST_PROXY during bootstrap.
    return Promise.resolve(`ip:${req.ip ?? 'unknown'}`);
  }
}
