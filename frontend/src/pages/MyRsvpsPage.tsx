import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { api } from '@/api/client';
import type { MyRsvp, Paginated } from '@/api/types';
import { ButtonLink } from '@/components/Button';
import { AttendanceStatusLabel, EventStatusLabel } from '@/components/StatusLabel';
import { EmptyState, ErrorState, LoadingAnnouncement } from '@/components/States';
import { Pagination } from '@/components/Pagination';
import { formatEventDateShort, formatTimeRange, formatZone } from '@/lib/format';
import './MyRsvpsPage.css';
export function MyRsvpsPage() {
  const [params,setParams] = useSearchParams(); const past = params.get('view') === 'past';
  const page = Math.max(1,Math.floor(Number(params.get('page')) || 1));
  const [result,setResult] = useState<Paginated<MyRsvp> | null>(null); const [error,setError] = useState<unknown>(null);
  const [busy,setBusy] = useState(true); const [retry,setRetry] = useState(0);
  useEffect(() => { const c = new AbortController(); setBusy(true); setError(null);
    api.listMyRsvps({upcoming:!past,page,limit:10},c.signal).then(data=>{if (!c.signal.aborted) setResult(data);})
      .catch(err=>{if (!c.signal.aborted) setError(err);}).finally(()=>{if (!c.signal.aborted) setBusy(false);});
    return ()=>c.abort();
  },[past,page,retry]);
  return <div className="page shell">
    <header className="page__head"><div><h1 className="page__title">Your plans, all here.</h1><p className="page__subtitle">The gatherings you’re part of, and the places you’re waiting for.</p></div><ButtonLink to="/events" variant="secondary">Explore events <ArrowUpRight size={17}/></ButtonLink></header>
    <div className="view-tabs" role="group" aria-label="RSVP time period"><button aria-pressed={!past} onClick={()=>setParams({})}>Coming up</button><button aria-pressed={past} onClick={()=>setParams({view:'past'})}>Past events</button></div>
    {error ? <ErrorState error={error} onRetry={()=>setRetry(n=>n+1)}/> : result === null ? <><LoadingAnnouncement label="Loading your RSVPs"/><div className="skeleton skeleton--row"/></> : result.data.length === 0 ? <EmptyState title={past ? 'No past gatherings yet.' : 'Find something to look forward to.'} description={past ? 'Events you RSVP to will appear here after they end.' : 'Discover an adoption day, learn about fostering, or lend a hand in your community.'} action={<ButtonLink to="/events">Find your next event</ButtonLink>}/> :
    <div aria-busy={busy}><p className="rsvp-count" role="status">{busy ? 'Loading…' : `${result.meta.total} ${past ? 'past' : 'upcoming'} ${result.meta.total === 1 ? 'event' : 'events'}`}</p><ul className="rsvp-list">{result.data.map(({event,status,waitlistPosition})=>
      <li key={event.id} className="rsvp-row"><div className="rsvp-date"><CalendarDate iso={event.startsAt} timezone={event.timezone}/></div><div className="rsvp-row__main"><h2><Link to={`/events/${event.id}`}>{event.title}</Link></h2><p>{formatEventDateShort(event.startsAt,event.timezone)} · {formatTimeRange(event.startsAt,event.endsAt,event.timezone)} {formatZone(event.startsAt,event.timezone)}</p><p><MapPin size={14} aria-hidden="true"/>{event.location}</p></div><div className="rsvp-row__status"><AttendanceStatusLabel status={status} waitlistPosition={past ? null : waitlistPosition}/>{event.status !== 'PUBLISHED' && <EventStatusLabel status={event.status}/>}<ArrowUpRight size={18} aria-hidden="true"/></div></li>
    )}</ul><Pagination meta={result.meta} busy={busy} onPage={p=>setParams({view:past ? 'past' : 'upcoming',page:String(p)})}/></div>}
  </div>;
}
function CalendarDate({iso,timezone}:{iso:string;timezone:string|null}) {
  const options = {timeZone:timezone ?? undefined};
  return <><span>{new Intl.DateTimeFormat('en-US',{...options,month:'short'}).format(new Date(iso))}</span><strong>{new Intl.DateTimeFormat('en-US',{...options,day:'numeric'}).format(new Date(iso))}</strong></>;
}
