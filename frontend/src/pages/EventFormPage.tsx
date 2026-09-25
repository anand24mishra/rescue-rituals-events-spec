import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '@/api/client';
import type { EventDraft, EventStatus, EventType } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { EVENT_TYPE_LABEL } from '@/components/EventTypeLabel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/Button';
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/Field';
import { ErrorState, LoadingAnnouncement } from '@/components/States';
import { useToast } from '@/components/Toast';

import { resolveEventTime, toDateTimeLocal, validTimeZone } from '@/lib/event-time';
import './EventFormPage.css';

const EVENT_TYPES: EventType[] = [
  'ADOPTION_EVENT',
  'RESCUE_FAIR',
  'FOSTER_WORKSHOP',
  'VOLUNTEER_EVENT',
  'COMMUNITY_MEETUP',
  'OTHER',
];

interface FormState {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  eventType: EventType;
  status: EventStatus;
  /** Empty string means "unlimited", which the API represents as null. */
  capacity: string;
  waitlistEnabled: boolean;
  timezone: string;
}

const twoHoursFrom = (date: Date) => new Date(date.getTime() + 7_200_000);

function defaultState(): FormState {
  // Next Saturday at 11:00 is a plausible default for a community event, and
  // saves the organiser the most tedious part of the form.
  const start = new Date();
  start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7 || 7));
  start.setHours(11, 0, 0, 0);

  return {
    title: '',
    description: '',
    location: '',
    startsAt: toDateTimeLocal(start.toISOString()),
    endsAt: toDateTimeLocal(twoHoursFrom(start).toISOString()),
    eventType: 'COMMUNITY_MEETUP',
    status: 'PUBLISHED',
    capacity: '',
    waitlistEnabled: true,
    // The browser's own zone: the organiser is almost always in the event's
    // timezone, and this is a far better guess than a hardcoded default.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function EventFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [form, setForm] = useState<FormState>(defaultState);
  const [initialForm,setInitialForm] = useState(() => JSON.stringify(form));
  const [saved,setSaved] = useState(false);
  const [savedId,setSavedId] = useState<string|null>(null);
  useEffect(() => { if (savedId) void navigate(`/organizer/events/${savedId}`); },[savedId,navigate]);
  const originals = useRef<{startsAt:string;endsAt:string;timezone:string}|null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(form) !== initialForm && !saved;
  const blocker = useBlocker(({currentLocation,nextLocation}) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useBeforeUnload(useCallback((e:BeforeUnloadEvent) => { if(dirty) {e.preventDefault();e.returnValue='';} },[dirty]));
  const resolveTime = (key:'startsAt'|'endsAt') => resolveEventTime(form[key],form.timezone,originals.current ? {iso:originals.current[key],timezone:originals.current.timezone} : undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);


  useEffect(() => {
    if (mode !== 'edit') return;

    const controller = new AbortController();
    setIsLoading(true);

    void api
      .getEvent(id, controller.signal)
      .then((event) => {
        // Guard in the UI as well as the API: showing an editable form for
        // somebody else's event only to have every save rejected would be a
        // pointless dead end.
        if (user !== null && event.createdById !== user.id) {
          setLoadError(
            new ApiError(
              403,
              'NOT_EVENT_OWNER',
              'Only the organiser who created this event can edit it.',
            ),
          );
          return;
        }

        setConfirmedCount(event.confirmedCount);
        const zone = event.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        originals.current = {startsAt:event.startsAt, endsAt:event.endsAt, timezone:zone};
        const loadedForm: FormState = {
          title: event.title,
          description: event.description,
          location: event.location,
          startsAt: toDateTimeLocal(event.startsAt, zone),
          endsAt: toDateTimeLocal(event.endsAt, zone),
          eventType: event.eventType,
          status: event.status,
          capacity: event.capacity === null ? '' : String(event.capacity),
          waitlistEnabled: event.waitlistEnabled,
          timezone: zone,
        };
        setForm(loadedForm);
        setInitialForm(JSON.stringify(loadedForm));
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setLoadError(caught);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [id, mode, user]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (form.title.trim().length < 3) {
      errors.title = 'Give the event a title of at least 3 characters.';
    }
    if (form.description.trim().length < 10) {
      errors.description = 'Add a short description — at least 10 characters.';
    }
    if (form.location.trim().length < 2) {
      errors.location = 'Where is it happening?';
    }
    if (form.startsAt === '') errors.startsAt = 'Choose a start time.';
    if (form.endsAt === '') errors.endsAt = 'Choose an end time.';

    if (!validTimeZone(form.timezone)) errors.timezone = 'Enter a valid time zone, such as America/New_York.';
    if (!errors.timezone) {
      for (const key of ['startsAt','endsAt'] as const) {
        if (form[key]) {
          try { resolveTime(key); } catch { errors[key] = 'This time is invalid or occurs twice due to a clock change. Choose another time.'; }
        }
      }
      if (!errors.startsAt && !errors.endsAt && new Date(resolveTime('endsAt')).getTime() <= new Date(resolveTime('startsAt')).getTime()) errors.endsAt = 'The end time must be after the start time.';
    }

    if (form.capacity !== '') {
      const capacity = Number(form.capacity);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
        errors.capacity = 'Use a whole number from 1 to 100,000.';
      } else if (mode === 'edit' && capacity < confirmedCount) {
        // Anticipates the API's 409 so the organiser is told before submitting.
        errors.capacity = `${confirmedCount} people are already confirmed. Capacity cannot go below that.`;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async () => {
    if (!validate()) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()); return; }

    const payload: EventDraft = {
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      startsAt: resolveTime('startsAt'),
      endsAt: resolveTime('endsAt'),
      eventType: form.eventType,
      status: form.status,
      capacity: form.capacity === '' ? null : Number(form.capacity),
      waitlistEnabled: form.waitlistEnabled,
      timezone: form.timezone === '' ? null : form.timezone,
    };

    setFormError(null);
    setIsSubmitting(true);

    try {
      const saved =
        mode === 'create'
          ? await api.createEvent(payload)
          : await api.updateEvent(id, payload);

      setSaved(true);
      notify(mode === 'create' ? 'Event created.' : 'Changes saved.');
      // Land on the organizer view, where the event's status, capacity and
      // attendees are all visible — rather than dropping the organizer on a
      // consumer page with no confirmation of what just happened (§24).
      setSavedId(saved.id);
    } catch (caught) {
      if (caught instanceof ApiError) {
        // The API returns per-field messages under details.fields; surfacing
        // them beats a single generic banner when one input is at fault.
        const fields = caught.details?.fields;
        if (Array.isArray(fields) && fields.length > 0) {
          setFormError(fields.map(String).join(' '));
        } else {
          setFormError(caught.message);
        }
      } else {
        setFormError('Could not save the event. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadError !== null) {
    return (
      <div className="page shell">
        <Link to="/organizer/events" className="back-link">
          <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} /> Your events
        </Link>
        <ErrorState error={loadError} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page shell">
        <LoadingAnnouncement label="Loading event" />
        <div className="form-skeleton">
          <div className="skeleton skeleton--heading" />
          <div className="skeleton skeleton--line" />
          <div className="skeleton skeleton--line" />
        </div>
      </div>
    );
  }

  return (
    <div className="page shell shell--wide event-form">
      <Link to={mode === 'edit' ? `/organizer/events/${id}` : '/organizer/events'} className="back-link">
        <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />{' '}
        {mode === 'edit' ? 'Back to event' : 'Your events'}
      </Link>

      <header className="event-form__head">
        <h1 className="page__title">
          {mode === 'create' ? 'Host an event' : 'Update your event'}
        </h1>
        <p className="page__lede">
          Give your community a reason to come together. Start with the essentials.
        </p>
      </header>

      <div className="event-form__layout">
      <form
        ref={formRef}
        className="event-form__form"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          void submit();
        }}
        noValidate
      >
        {formError !== null ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}

        <fieldset className="event-form__group">
          <legend>The basics</legend>

          <TextField
            label="Title"
            value={form.title}
            error={fieldErrors.title}
            maxLength={160}
            placeholder="Brooklyn Rescue Adoption Fair"
            onChange={(changeEvent) => set('title', changeEvent.target.value)}
          />

          <TextAreaField
            label="Description"
            value={form.description}
            error={fieldErrors.description}
            maxLength={5000}
            placeholder="What happens, who it's for, and anything people should bring."
            hint="Leave a blank line between paragraphs to break up longer descriptions."
            onChange={(changeEvent) => set('description', changeEvent.target.value)}
          />

          <div className="event-form__row">
            <TextField
              label="Location"
              value={form.location}
              error={fieldErrors.location}
              maxLength={255}
              placeholder="Brooklyn, NY"
              onChange={(changeEvent) => set('location', changeEvent.target.value)}
            />

            <SelectField
              label="Type"
              value={form.eventType}
              onChange={(changeEvent) =>
                set('eventType', changeEvent.target.value as EventType)
              }
            >
              {EVENT_TYPES.map((type) => (
                <option value={type} key={type}>
                  {EVENT_TYPE_LABEL[type]}
                </option>
              ))}
            </SelectField>
          </div>
        </fieldset>

        <fieldset className="event-form__group">
          <legend>Schedule</legend>

          <div className="event-form__row">
            <TextField
              label="Starts"
              type="datetime-local"
              value={form.startsAt}
              error={fieldErrors.startsAt}
              onChange={(changeEvent) => {
                const value = changeEvent.target.value;
                set('startsAt', value);

              }}
            />

            <TextField
              label="Ends"
              type="datetime-local"
              value={form.endsAt}
              error={fieldErrors.endsAt}
              onChange={(changeEvent) => set('endsAt', changeEvent.target.value)}
            />
          </div>

          <TextField
            label="Time zone"
            value={form.timezone}
            error={fieldErrors.timezone}
            hint="Start and end times use this zone. Changing the zone keeps the clock times above and changes when the event happens."
            onChange={(changeEvent) => set('timezone', changeEvent.target.value)}
          />
        </fieldset>

        <fieldset className="event-form__group">
          <legend>Attendance</legend>

          <TextField
            label="Maximum attendees"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={form.capacity}
            error={fieldErrors.capacity}
            placeholder="Leave empty for unlimited"
            hint={
              mode === 'edit' && confirmedCount > 0
                ? `${confirmedCount} ${confirmedCount === 1 ? 'person is' : 'people are'} already confirmed. Capacity cannot be set below that.`
                : 'Leave empty if there is no limit.'
            }
            onChange={(changeEvent) => set('capacity', changeEvent.target.value)}
          />

          <CheckboxField
            label="Open a waitlist when full"
            hint="When a place opens, the next person waiting is confirmed automatically."
            checked={form.waitlistEnabled}
            onChange={(changeEvent) => set('waitlistEnabled', changeEvent.target.checked)}
          />
        </fieldset>

        <fieldset className="event-form__group">
          <legend>Visibility</legend>

          <SelectField
            label="Status"
            value={form.status}
            hint="A draft is visible only to you. Cancelling keeps the event and its RSVPs readable but stops new ones."
            onChange={(changeEvent) =>
              set('status', changeEvent.target.value as EventStatus)
            }
          >
            <option value="PUBLISHED">Published — anyone can find and join</option>
            <option value="DRAFT">Draft — only visible to me</option>
            {mode === 'edit' ? (
              <>
                <option value="CANCELLED">Cancelled — no new RSVPs</option>
                <option value="COMPLETED">Completed — it has happened</option>
              </>
            ) : null}
          </SelectField>
        </fieldset>

        <div className="event-form__actions">
          <Button type="submit" size="lg" isLoading={isSubmitting}>
            {mode === 'create' ? form.status === 'DRAFT' ? 'Save draft' : 'Publish event' : 'Save changes'}
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="lg"
            onClick={() => void navigate(mode === 'edit' ? `/organizer/events/${id}` : '/organizer/events')}
          >
            Cancel
          </Button>
        </div>
      </form>
      <aside className="event-form__summary"><h2>At a glance</h2><p className="event-form__preview-title">{form.title || 'Your event title'}</p><dl><div><dt>Gathering</dt><dd>{EVENT_TYPE_LABEL[form.eventType]}</dd></div><div><dt>Where</dt><dd>{form.location || 'Add a location'}</dd></div><div><dt>Starts</dt><dd>{form.startsAt.replace('T', ' at ')}<br/>{form.timezone}</dd></div><div><dt>Capacity</dt><dd>{form.capacity ? `${form.capacity} people` : 'Unlimited places'}</dd></div><div><dt>Visibility</dt><dd>{form.status === 'DRAFT' ? 'Only you can see this' : form.status === 'PUBLISHED' ? 'Public event' : form.status.toLowerCase()}</dd></div></dl><p className="event-form__summary-note">{form.status === 'DRAFT' ? 'Take your time. You can publish when everything is ready.' : 'Review the details before saving. These are the details your community will see.'}</p></aside>
      </div>
      <ConfirmDialog isOpen={blocker.state === 'blocked'} title="Leave without saving?" description="Your changes haven’t been saved. Stay here to finish, or leave and discard them." confirmLabel="Discard changes" cancelLabel="Keep editing" tone="danger" onConfirm={() => blocker.state === 'blocked' && blocker.proceed()} onCancel={() => blocker.state === 'blocked' && blocker.reset()}/>
    </div>
  );
}
