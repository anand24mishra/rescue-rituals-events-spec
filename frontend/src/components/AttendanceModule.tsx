import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventSummary } from '@/api/types';
import { AttendanceMeter } from './AttendanceMeter';
import { Button } from './Button';
import './AttendanceModule.css';

/**
 * The attendance module — the signature interaction of the product (§17).
 *
 * It is a small state machine rendered honestly: the caller is either not
 * signed in, able to join, confirmed, queued, or looking at an event that is
 * closed. Each state states the facts and offers exactly one action.
 *
 * Two deliberate choices:
 *
 *  - The status lives here, in the page, rather than in a toast. A toast
 *    disappears; "you are #4 in line" needs to still be true and visible when
 *    the person comes back tomorrow (§28).
 *  - Nothing is optimistic. The button shows "Joining…" until the server
 *    answers, and only then does the state change (§18.2). Showing "Confirmed"
 *    before the server agrees would make the most important state in the
 *    product the least trustworthy.
 */
export function AttendanceModule({
  event,
  isSignedIn,
  isSubmitting,
  onJoin,
  onLeave,
}: {
  event: EventSummary;
  isSignedIn: boolean;
  isSubmitting: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const [now,setNow] = useState(() => Date.now());
  useEffect(() => {const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer);},[]);
  const viewerRsvp = event.viewerRsvp ?? null;
  const hasEnded = event.status === 'COMPLETED' || new Date(event.endsAt).getTime() <= now;
  const isDraft = event.status === 'DRAFT';
  const isCancelled = event.status === 'CANCELLED';

  if (isCancelled || hasEnded || isDraft) {
    return (
      <section className="attendance" aria-labelledby="attendance-heading">
        <h2 className="attendance__title" id="attendance-heading">
          Attendance
        </h2>
        <p className="attendance__headline">
          {isDraft ? 'Not published yet' : isCancelled ? 'Event cancelled' : 'Event finished'}
        </p>
        <p className="attendance__body">
          {isDraft ? 'Publish this event from the organizer view to open RSVPs.' : isCancelled
            ? 'The organizer cancelled this event. It is no longer accepting RSVPs.'
            : 'This event has already taken place.'}
        </p>
      </section>
    );
  }

  return (
    <section className="attendance" aria-labelledby="attendance-heading">
      <h2 className="attendance__title" id="attendance-heading">
        Your place at this event
      </h2>

      <AttendanceMeter
        confirmedCount={event.confirmedCount}
        capacity={event.capacity}
      />

      {/* The state region is announced when it changes, so the outcome of an
          RSVP reaches a screen reader without a toast. */}
      <div className="attendance__state" role="status" aria-live="polite">
        {viewerRsvp?.status === 'CONFIRMED' ? (
          <>
            <p className="attendance__headline attendance__headline--confirmed">
              You&rsquo;re confirmed
            </p>
            <p className="attendance__body">
              You have a place at this event. If you can no longer make it,
              you can cancel your RSVP here.
            </p>
          </>
        ) : viewerRsvp?.status === 'WAITLISTED' ? (
          <>
            <p className="attendance__headline">
              Waitlisted
              {viewerRsvp.waitlistPosition !== null ? (
                <span className="attendance__position">
                  {' '}
                  · Position #{viewerRsvp.waitlistPosition}
                </span>
              ) : null}
            </p>
            <p className="attendance__body">
              The event is full. We&rsquo;ll move you in automatically if a place
              opens up.
            </p>
          </>
        ) : event.isFull ? (
          <>
            <p className="attendance__headline">Event full</p>
            <p className="attendance__body">
              {event.waitlistEnabled
                ? 'You can join the waitlist and we’ll move you in if a place opens.'
                : 'The organizer has not opened a waitlist for this event.'}
            </p>
          </>
        ) : null}
      </div>

      <div className="attendance__action">
        {event.isFull && !event.waitlistEnabled && viewerRsvp === null ? <Button fullWidth size="lg" disabled>Event full</Button> : !isSignedIn ? (
          <>
            <Button variant="primary" size="lg" fullWidth onClick={onJoin}>
              {event.isFull ? 'Sign in to join waitlist' : 'Sign in to RSVP'}
            </Button>
            <p className="attendance__note">
              New here? <Link to="/register" state={{from:`/events/${event.id}`}}>Create an account</Link>.
            </p>
          </>
        ) : viewerRsvp !== null ? (
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            loadingLabel="Cancelling…"
            onClick={onLeave}
          >
            {viewerRsvp.status === 'WAITLISTED' ? 'Leave waitlist' : 'Cancel RSVP'}
          </Button>
        ) : event.isFull && !event.waitlistEnabled ? (
          <Button variant="primary" size="lg" fullWidth disabled>
            Event full
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            loadingLabel="Joining…"
            onClick={onJoin}
          >
            {event.isFull ? 'Join waitlist' : 'RSVP'}
          </Button>
        )}
      </div>
    </section>
  );
}
