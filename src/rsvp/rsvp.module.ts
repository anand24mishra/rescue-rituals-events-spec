import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { MeController } from './me.controller';
import { RsvpController } from './rsvp.controller';
import { RsvpService } from './rsvp.service';

@Module({
  controllers: [RsvpController, MeController],
  providers: [RsvpService, IdempotencyService],
  // Exported so EventsService can report the caller's own RSVP state on event
  // detail without duplicating the waitlist-position logic.
  exports: [RsvpService],
})
export class RsvpModule {}
