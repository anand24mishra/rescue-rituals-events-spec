import type { EventStatus, RsvpStatus } from '@/api/types';
import './StatusLabel.css';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

/**
 * A small dot-and-text status marker.
 *
 * Design.md §22 asks for a small label rather than a banner, and §32 requires
 * that status is never encoded by colour alone — so the word is always present
 * and the dot only reinforces it.
 */
export function StatusLabel({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className={`status status--${tone}`}>
      <span className="status__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

const EVENT_STATUS_TONE: Record<EventStatus, Tone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  CANCELLED: 'danger',
  COMPLETED: 'neutral',
};

const EVENT_STATUS_TEXT: Record<EventStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export function EventStatusLabel({ status }: { status: EventStatus }) {
  return (
    <StatusLabel tone={EVENT_STATUS_TONE[status]}>
      {EVENT_STATUS_TEXT[status]}
    </StatusLabel>
  );
}

/** The caller's own attendance, with the queue position when queued (§36). */
export function AttendanceStatusLabel({
  status,
  waitlistPosition,
}: {
  status: RsvpStatus;
  waitlistPosition: number | null;
}) {
  if (status === 'CONFIRMED') {
    return <StatusLabel tone="success">Confirmed</StatusLabel>;
  }
  if (status === 'WAITLISTED') {
    return (
      <StatusLabel tone="warning">
        {waitlistPosition === null ? 'Waitlisted' : `Waitlisted · #${waitlistPosition}`}
      </StatusLabel>
    );
  }
  return <StatusLabel tone="neutral">Cancelled</StatusLabel>;
}
