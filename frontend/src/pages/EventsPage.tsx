import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapPin, Search, ArrowUpRight } from 'lucide-react';
import { api } from '@/api/client';
import type { EventSummary, EventType, Paginated } from '@/api/types';
import { Button, ButtonLink } from '@/components/Button';
import { EventCard, FeaturedEvent } from '@/components/EventCard';
import { EmptyState, ErrorState, EventListSkeleton, LoadingAnnouncement } from '@/components/States';
import { Pagination } from '@/components/Pagination';
import './EventsPage.css';

const FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'All events' }, { id: 'ADOPTION_EVENT', label: 'Adoption' },
  { id: 'FOSTER_WORKSHOP', label: 'Fostering' }, { id: 'VOLUNTEER_EVENT', label: 'Volunteering' },
  { id: 'RESCUE_FAIR', label: 'Rescue fairs' }, { id: 'COMMUNITY_MEETUP', label: 'Community' },
  { id: 'OTHER', label: 'Other' },
];
export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
  const category = FILTERS.some(f => f.id === params.get('filter')) ? params.get('filter') ?? '' : '';
  const search = params.get('search') ?? '';
  const location = params.get('location') ?? '';
  const [result, setResult] = useState<Paginated<EventSummary> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const filters = useMemo(() => ({page, limit: 7, upcoming: true, search: search || undefined,
    location: location || undefined, eventType: (category || undefined) as EventType | undefined}), [page, search, location, category]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(null);
    api.listEvents(filters, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(err => { if (!controller.signal.aborted) setError(err); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [filters, retry]);
  const update = useCallback((values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    Object.entries(values).forEach(([key,value]) => value ? next.set(key,value) : next.delete(key));
    setParams(next);
  }, [params, setParams]);
  const filtered = Boolean(category || search || location);
  const events = result?.data ?? [];
  const lead = !filtered && page === 1 ? events[0] : undefined;
  return <div className="page shell shell--wide discovery">
    <header className="discovery__head">
      <h1 className="discovery__title">Good things happen<br/>when we <em>show up.</em></h1>
      <div className="discovery__intro"><p>Find your place in the rescue community.<br className="desktop-break"/> Adoption days, foster workshops, and time well spent.</p>
        <ButtonLink to="/organizer/events/new" variant="quiet">Bring people together <ArrowUpRight size={16} aria-hidden="true"/></ButtonLink>
      </div>
    </header>
    <form key={`${search}|${location}`} className="discovery-search" role="search" onSubmit={e => {
      e.preventDefault(); const data = new FormData(e.currentTarget);
      update({ search: String(data.get('search') ?? '').trim(), location: String(data.get('location') ?? '').trim() });
    }}>
      <label><Search size={19} aria-hidden="true"/><span className="sr-only">Search event titles</span><input name="search" defaultValue={search} maxLength={160} placeholder="Find an event" type="search"/></label>
      <label><MapPin size={19} aria-hidden="true"/><span className="sr-only">Location</span><input name="location" defaultValue={location} maxLength={255} placeholder="City or neighborhood"/></label>
      <Button type="submit">Find events</Button>
    </form>
    <div className="filter-bar" role="group" aria-label="Event category">
      {FILTERS.map(f => <button key={f.id} className="filter-chip" aria-pressed={category === f.id} onClick={() => update({filter:f.id})}>{f.label}</button>)}
    </div>
    <div className="results-heading"><h2>{filtered ? 'Your search results' : 'Coming up in the community'}</h2>
      <div className="results-heading__aside"><span role="status">{busy ? 'Finding events…' : result ? `${result.meta.total} event${result.meta.total === 1 ? '' : 's'}` : ''}</span>
      {filtered && <Button variant="quiet" size="sm" onClick={() => setParams({})}>Clear filters</Button>}</div>
    </div>
    {error ? <ErrorState error={error} onRetry={() => setRetry(n => n+1)}/> : result === null ? <><LoadingAnnouncement label="Loading events"/><EventListSkeleton count={3}/></> : events.length === 0 ?
      <EmptyState title={filtered ? 'No events match just yet.' : 'Something good is on its way.'} description={filtered ? 'Try a different search or location, or explore all upcoming events.' : 'There are no upcoming events right now. Come back soon for more ways to get involved.'} action={filtered ? <Button variant="secondary" onClick={() => setParams({})}>Explore all events</Button> : <ButtonLink to="/organizer/events/new">Host an event</ButtonLink>}/> :
      <div className="discovery-results" aria-busy={busy} data-fetching={busy}>
        {lead && <FeaturedEvent event={lead}/>}
        <div className="event-grid">{(lead ? events.slice(1) : events).map(event => <EventCard key={event.id} event={event}/>)}</div>
        <Pagination meta={result.meta} busy={busy} onPage={value => {
          const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next);
          document.querySelector('.results-heading')?.scrollIntoView({block:'start'});
        }}/>
      </div>}
  </div>;
}
