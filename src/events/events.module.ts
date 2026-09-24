import { Module } from '@nestjs/common';
import { RsvpModule } from '../rsvp/rsvp.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [RsvpModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
