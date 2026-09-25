import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, MapPin } from 'lucide-react';
import { ApiError, api } from '@/api/client';
import type { EventSummary } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AttendanceModule } from '@/components/AttendanceModule';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EventBlock } from '@/components/EventBlock';
import { EventStatusLabel } from '@/components/StatusLabel';
import { ButtonLink } from '@/components/Button';
import { ErrorState, EventDetailSkeleton, LoadingAnnouncement } from '@/components/States';
import { useToast } from '@/components/Toast';
import {
  formatEventDate,
  formatRelative,
  formatTimeRange,
  formatZone,
} from '@/lib/format';
import './EventDetailPage.css';

export function EventDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  // Captured once per load.
  const [now] = useState(() => Date.now());

  useEffect(() => { if (event) document.title = `${event.title} — Rescue Rituals`; }, [event]);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setError(null);
      return api
        .getEvent(id, signal)
        .then(setEvent)
        .catch((caught: unknown) => {
          if (caught instanceof DOMException && caught.name === 'AbortError') return;
          setError(caught);
        });
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    setEvent(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load, user?.id]);

  const handleJoin = async () => {
    if (user === null) {
      void navigate('/login', { state: { from: `/events/${id}` } });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.rsvp(id);
      await load();
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      notify(
        apiError?.message ??
          "We couldn't reach the server. Your RSVP wasn't changed.",
        'error',
      );
      await load();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeave = async () => {
    setIsSubmitting(true);
    try {
      await api.cancelRsvp(id);
      await load();
      setIsConfirmingCancel(false);
    } catch (caught) {
      notify(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't reach the server. Your RSVP wasn't changed.",
        'error',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error !== null) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="page shell">
        <BackLink />
        {notFound ? (
          <ErrorState
            title="We couldn't find that event"
            error={
              new ApiError(
                404,
                'EVENT_NOT_FOUND',
                'It may have been removed, or the link may be outdated. If it is a draft, only its organizer can see it.',
              )
            }
          />
        ) : (
          <ErrorState error={error} onRetry={() => void load()} />
        )}
      </div>
    );
  }

  if (event === null) {
    return (
      <div className="page shell">
        <LoadingAnnouncement label="Loading event" />
        <EventDetailSkeleton />
      </div>
    );
  }

  const zone = formatZone(event.startsAt, event.timezone);
  const isOrganizer = user !== null && event.createdById === user.id;
  const isConfirmed = event.viewerRsvp?.status === 'CONFIRMED';

  return (
    <article className="page shell detail">
      <BackLink />

      <div className="detail__layout">
        <header className="detail__intro">
          {event.status !== 'PUBLISHED' && <EventStatusLabel status={event.status}/>}
          <h1 className="detail__title">{event.title}</h1>
          <dl className="detail__facts">
            <div><dt><Calendar size={18} aria-hidden="true"/><span className="sr-only">Date</span></dt><dd><time dateTime={event.startsAt}>{formatEventDate(event.startsAt,event.timezone)}</time><span className="detail__relative">{formatRelative(event.startsAt,now)}</span></dd></div>
            <div><dt><Clock size={18} aria-hidden="true"/><span className="sr-only">Time</span></dt><dd>{formatTimeRange(event.startsAt,event.endsAt,event.timezone)} <span className="detail__zone">{zone}</span></dd></div>
            <div><dt><MapPin size={18} aria-hidden="true"/><span className="sr-only">Location</span></dt><dd>{event.location}</dd></div>
          </dl>
          {event.organiser && <p className="detail__host">Hosted by <strong>{event.organiser.name}</strong></p>}
        </header>
        <aside className="detail__rail">
          <AttendanceModule event={event} isSignedIn={user !== null} isSubmitting={isSubmitting} onJoin={() => void handleJoin()} onLeave={() => { if (isConfirmed) setIsConfirmingCancel(true); else void handleLeave(); }}/>
          {isOrganizer && <div className="detail__manage"><p>You’re hosting this event.</p><ButtonLink to={`/organizer/events/${event.id}`} variant="secondary" fullWidth>Manage event</ButtonLink></div>}
        </aside>
        <div className="detail__visual"><EventBlock eventType={event.eventType} size="lg"/></div>
        <section className="detail__content"><h2>About this gathering</h2>{event.description.split(/\n{2,}/).map((paragraph,index) => <p key={index}>{paragraph}</p>)}</section>
      </div>

      <ConfirmDialog
        isOpen={isConfirmingCancel}
        title="Cancel your RSVP?"
        description={event.waitlistEnabled ? 'Your place may go to someone on the waitlist. If you RSVP again later, the event may be full.' : 'Your place will become available to someone else. If you RSVP again later, the event may be full.'}
        confirmLabel="Cancel RSVP"
        cancelLabel="Keep my place"
        tone="danger"
        isSubmitting={isSubmitting}
        onConfirm={() => void handleLeave()}
        onCancel={() => setIsConfirmingCancel(false)}
      />
    </article>
  );
}

function BackLink() {
  return (
    <Link to="/events" className="back-link">
      <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
      Events
    </Link>
  );
}
