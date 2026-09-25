import type { EventType } from '@/api/types';

/** Human language, not enum names (§33.3). */
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  ADOPTION_EVENT: 'Adoption event',
  RESCUE_FAIR: 'Rescue fair',
  FOSTER_WORKSHOP: 'Foster workshop',
  VOLUNTEER_EVENT: 'Volunteer event',
  COMMUNITY_MEETUP: 'Community meetup',
  OTHER: 'Community event',
};

/** Stable block colour per type, so an event without photography still reads. */
export const EVENT_TYPE_BLOCK: Record<EventType, string> = {
  ADOPTION_EVENT: 'var(--block-adoption)',
  RESCUE_FAIR: 'var(--block-fair)',
  FOSTER_WORKSHOP: 'var(--block-foster)',
  VOLUNTEER_EVENT: 'var(--block-volunteer)',
  COMMUNITY_MEETUP: 'var(--block-meetup)',
  OTHER: 'var(--block-other)',
};

/** The event type as a quiet micro-label above a title. */
export function EventTypeLabel({ type }: { type: EventType }) {
  return <span className="micro-label">{EVENT_TYPE_LABEL[type]}</span>;
}
