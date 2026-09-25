import type { EventType } from '@/api/types';
import { EVENT_TYPE_LABEL } from './EventTypeLabel';
import './EventBlock.css';

/** Maps event type to its photographic image. */
const EVENT_TYPE_IMAGE: Record<EventType, string> = {
  ADOPTION_EVENT: '/images/adoption_event.jpg',
  RESCUE_FAIR: '/images/rescue_fair.jpg',
  FOSTER_WORKSHOP: '/images/foster_workshop.jpg',
  VOLUNTEER_EVENT: '/images/volunteer_event.jpg',
  COMMUNITY_MEETUP: '/images/community_meetup.jpg',
  OTHER: '/images/other_event.jpg',
};

/** Fallback gradient per event type for when image is loading or fails. */
const EVENT_TYPE_GRADIENT: Record<EventType, string> = {
  ADOPTION_EVENT: 'linear-gradient(135deg, #3f6350 0%, #2d4a3a 100%)',
  RESCUE_FAIR: 'linear-gradient(135deg, #b8603f 0%, #8b3e22 100%)',
  FOSTER_WORKSHOP: 'linear-gradient(135deg, #8a6a3a 0%, #6b4f25 100%)',
  VOLUNTEER_EVENT: 'linear-gradient(135deg, #4a5f6e 0%, #2e3d4a 100%)',
  COMMUNITY_MEETUP: 'linear-gradient(135deg, #6b5b7b 0%, #4a3d5b 100%)',
  OTHER: 'linear-gradient(135deg, #5c6157 0%, #3e4339 100%)',
};

/**
 * Editorial photograph block with smooth entrance zoom and restrained badge.
 */
export function EventBlock({
  eventType,
  size = 'md',
}: {
  eventType: EventType;
  location?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div
      className={`event-block event-block--${size}`}
      style={{ background: EVENT_TYPE_GRADIENT[eventType] }}
      aria-hidden="true"
    >
      <img
        src={EVENT_TYPE_IMAGE[eventType]}
        alt=""
        className="event-block__img"
        loading={size === 'lg' ? 'eager' : 'lazy'}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="event-block__scrim" />
      <div className="event-block__pill-badge">
        <span>{EVENT_TYPE_LABEL[eventType]}</span>
      </div>
    </div>
  );
}
