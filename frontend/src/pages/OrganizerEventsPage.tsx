import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Plus, CalendarDays } from 'lucide-react';
import { api } from '@/api/client';
import type { EventSummary, EventStatus, Paginated } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { ButtonLink } from '@/components/Button';
import { EventStatusLabel } from '@/components/StatusLabel';
import { EmptyState, ErrorState, LoadingAnnouncement } from '@/components/States';
import { Pagination } from '@/components/Pagination';
import { formatEventDateShort, formatZone } from '@/lib/format';
import './OrganizerPages.css';
const VIEWS: {id:string; label:string; status:EventStatus; upcoming:boolean}[] = [
  {id:'upcoming',label:'Upcoming',status:'PUBLISHED',upcoming:true},
  {id:'drafts',label:'Drafts',status:'DRAFT',upcoming:false},
  {id:'published',label:'All published',status:'PUBLISHED',upcoming:false},
  {id:'completed',label:'Completed',status:'COMPLETED',upcoming:false},
  {id:'cancelled',label:'Cancelled',status:'CANCELLED',upcoming:false},
];
export function OrganizerEventsPage() {
  const {user} = useAuth(); const [params,setParams] = useSearchParams();
  const view = VIEWS.find(v => v.id === params.get('view')) ?? VIEWS[0];
  const page = Math.max(1,Math.floor(Number(params.get('page')) || 1));
  const [result,setResult] = useState<Paginated<EventSummary> | null>(null);
  const [error,setError] = useState<unknown>(null); const [busy,setBusy] = useState(true); const [retry,setRetry] = useState(0);
  useEffect(() => {
    if (!user) return;
    const c = new AbortController(); setBusy(true); setError(null);
    api.listEvents({createdById:user.id, upcoming:view.upcoming,status:view.status,page,limit:10},c.signal)
      .then(data => {if (!c.signal.aborted) setResult(data);})
      .catch(err => {if (!c.signal.aborted) setError(err);})
      .finally(() => {if (!c.signal.aborted) setBusy(false);});
    return () => c.abort();
  },[user,view,page,retry]);
  return <div className="page shell shell--wide organizer">
    <header className="page__head"><div><h1 className="page__title">Your events</h1><p className="page__subtitle">Make room for good things. We’ll help you keep track.</p></div><ButtonLink to="/organizer/events/new"><Plus size={17} aria-hidden="true"/> Create event</ButtonLink></header>
    <div className="view-tabs" role="group" aria-label="Event views">{VIEWS.map(v => <button key={v.id} aria-pressed={view.id === v.id} onClick={() => setParams({view:v.id})}>{v.label}</button>)}</div>
    <div className="org-list-caption"><p>{view.id === 'upcoming' ? 'Next on your calendar' : `${view.label} events`}</p><span role="status">{busy ? 'Loading…' : `${result?.meta.total ?? 0} events`}</span></div>
    {error ? <ErrorState error={error} onRetry={() => setRetry(n=>n+1)}/> : result === null ? <><LoadingAnnouncement label="Loading your events"/><div className="skeleton skeleton--row"/></> : result.data.length === 0 ?
      <EmptyState title={view.id === 'upcoming' ? 'Your next gathering starts here.' : `No ${view.label.toLowerCase()} events.`} description="Create an event or choose another view to find your gatherings." action={<ButtonLink to="/organizer/events/new">Create an event</ButtonLink>}/> :
      <div aria-busy={busy} className="org-results" data-fetching={busy}><table className="events-table"><caption className="sr-only">Your {view.label.toLowerCase()} events</caption><thead><tr><th>Event</th><th>Status</th><th>Attendance</th><th><span className="sr-only">Manage</span></th></tr></thead><tbody>
        {result.data.map(event => <tr key={event.id}><td><div className="org-event-name"><span className="org-event-icon"><CalendarDays size={21} aria-hidden="true"/></span><div><Link className="org-table__title" to={`/organizer/events/${event.id}`}>{event.title}</Link><p className="org-table__meta">{formatEventDateShort(event.startsAt,event.timezone)} · {event.location} · {formatZone(event.startsAt,event.timezone)}</p></div></div></td><td><EventStatusLabel status={event.status}/></td><td><span className="org-attendance">{event.confirmedCount} <span>{event.capacity === null ? 'confirmed · unlimited' : `of ${event.capacity} confirmed`}</span></span>{event.capacity !== null && <span className="org-capacity-track" aria-hidden="true"><span style={{width:`${Math.min(100,event.confirmedCount/event.capacity*100)}%`}}/></span>}</td><td><ArrowUpRight size={19} aria-hidden="true"/></td></tr>)}
      </tbody></table><Pagination meta={result.meta} busy={busy} onPage={p => setParams({view:view.id,page:String(p)})}/></div>}
  </div>;
}
