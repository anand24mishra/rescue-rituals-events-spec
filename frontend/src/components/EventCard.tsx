import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EventSummary } from '@/api/types';
import { formatEventDateShort, formatTimeRange, formatZone } from '@/lib/format';
import { EventBlock } from './EventBlock';
import { EVENT_TYPE_LABEL } from './EventTypeLabel';
import { AttendanceStatusLabel } from './StatusLabel';
import './EventCard.css';
function EventFacts({event}: {event: EventSummary}) {
  return <div className="event-card__meta"><p><CalendarDays size={16} aria-hidden="true"/><span><time dateTime={event.startsAt}>{formatEventDateShort(event.startsAt,event.timezone)}</time><span className="event-card__time">{formatTimeRange(event.startsAt,event.endsAt,event.timezone)} {formatZone(event.startsAt,event.timezone)}</span></span></p><p><MapPin size={16} aria-hidden="true"/>{event.location}</p></div>;
}
function Availability({event}: {event: EventSummary}) {
  if (event.viewerRsvp) return <AttendanceStatusLabel {...event.viewerRsvp}/>;
  return <span className={`event-availability${event.isFull ? ' event-availability--full' : ''}`}>{event.isFull ? event.waitlistEnabled ? 'Waitlist available' : 'Fully booked' : event.spotsRemaining === null ? 'Places available' : `${event.spotsRemaining} ${event.spotsRemaining === 1 ? 'place' : 'places'} left`}</span>;
}
export function EventCard({event}: {event: EventSummary}) {
  return <article className="event-card"><EventBlock eventType={event.eventType}/><div className="event-card__body"><p className="event-card__category">{EVENT_TYPE_LABEL[event.eventType]}</p>
    <h3><Link className="event-card__title-link" to={`/events/${event.id}`}>{event.title}</Link></h3><EventFacts event={event}/><div className="event-card__foot"><Availability event={event}/><ArrowUpRight size={20} aria-hidden="true"/></div></div></article>;
}
export function FeaturedEvent({event}: {event: EventSummary}) {
  return <article className="featured"><div className="featured__visual"><EventBlock eventType={event.eventType} size="lg"/></div><div className="featured__body">
    <h3><Link className="event-card__title-link" to={`/events/${event.id}`}>{event.title}</Link></h3><p className="featured__description">{event.description}</p><EventFacts event={event}/>
    <div className="event-card__foot"><Availability event={event}/><span className="featured__action" aria-hidden="true">Explore event <ArrowUpRight size={18}/></span></div>
  </div></article>;
}
