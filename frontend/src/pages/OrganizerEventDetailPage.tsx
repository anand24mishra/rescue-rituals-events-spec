import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Pencil } from 'lucide-react';
import { ApiError, api } from '@/api/client';
import type { Attendee, EventSummary, Paginated } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button, ButtonLink } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EventStatusLabel } from '@/components/StatusLabel';
import { ErrorState, LoadingAnnouncement, EmptyState } from '@/components/States';
import { Pagination } from '@/components/Pagination';
import { useToast } from '@/components/Toast';
import { formatEventDate, formatTimeRange, formatZone } from '@/lib/format';
import './OrganizerPages.css';
export function OrganizerEventDetailPage() {
  const {id=''} = useParams(); const {user} = useAuth(); const {notify} = useToast(); const navigate = useNavigate();
  const [event,setEvent] = useState<EventSummary|null>(null);
  const [roster,setRoster] = useState<Paginated<Attendee>|null>(null);
  const [waitingTotal,setWaitingTotal] = useState(0);
  const [status,setStatus] = useState<'CONFIRMED'|'WAITLISTED'>('CONFIRMED'); const [page,setPage] = useState(1);
  const [error,setError] = useState<unknown>(null); const [busy,setBusy] = useState(false); const [retry,setRetry] = useState(0);
  const [isDeleting,setIsDeleting] = useState(false); const [isConfirmingDelete,setIsConfirmingDelete] = useState(false);
  const load = useCallback(async (signal:AbortSignal) => {
    setBusy(true); setError(null);
    try {
      const loaded = await api.getEvent(id,signal);
      if (loaded.createdById !== user?.id) throw new ApiError(403,'NOT_EVENT_OWNER','Only the host can manage this event.');
      const [rows,queue] = await Promise.all([api.listAttendees(id,{status,page,limit:20},signal),api.listAttendees(id,{status:'WAITLISTED',limit:1},signal)]);
      if (!signal.aborted) {setEvent(loaded);setRoster(rows);setWaitingTotal(queue.meta.total);}
    } catch(err) {if (!signal.aborted) setError(err);} finally {if (!signal.aborted) setBusy(false);}
  },[id,user,status,page]);
  useEffect(()=>{const c=new AbortController();void load(c.signal);return ()=>c.abort();},[load,retry]);
  useEffect(()=>{if (event) document.title=`Manage ${event.title} — Rescue Rituals`;},[event]);
  const remove = async () => {
    setIsDeleting(true);
    try {await api.deleteEvent(id);notify('Event deleted.');void navigate('/organizer/events');}
    catch(err) {notify(err instanceof Error ? err.message : 'Could not delete the event. Try again.','error');setIsDeleting(false);setIsConfirmingDelete(false);}
  };
  const back=<Link to="/organizer/events" className="back-link"><ArrowLeft size={16}/>Your events</Link>;
  if(error) return <div className="page shell">{back}<ErrorState error={error} onRetry={()=>setRetry(n=>n+1)}/></div>;
  if(!event) return <div className="page shell"><LoadingAnnouncement label="Loading event"/><div className="skeleton skeleton--heading"/><div className="skeleton skeleton--row"/></div>;
  return <div className="page shell shell--wide org-detail">{back}<header className="org-detail-head"><div><h1 className="page__title">{event.title}</h1><p className="page__lede">{formatEventDate(event.startsAt,event.timezone)} · {formatTimeRange(event.startsAt,event.endsAt,event.timezone)} {formatZone(event.startsAt,event.timezone)}<br/>{event.location}</p></div><div className="org-actions"><ButtonLink to={`/organizer/events/${id}/edit`}><Pencil size={16}/>Edit event</ButtonLink><ButtonLink to={`/events/${id}`} variant="secondary">Public view <ArrowUpRight size={16}/></ButtonLink></div></header>
    <EventStatusLabel status={event.status}/>
    <dl className="metrics"><div><dt className="metric__label">Confirmed</dt><dd className="metric__value">{event.confirmedCount}</dd></div><div><dt className="metric__label">Capacity</dt><dd className="metric__value">{event.capacity ?? 'Unlimited'}</dd></div><div><dt className="metric__label">Waitlisted</dt><dd className="metric__value">{waitingTotal}</dd></div><div><dt className="metric__label">Places available</dt><dd className="metric__value">{event.spotsRemaining ?? 'Unlimited'}</dd></div></dl>
    <h2 className="org-section__heading">The people showing up</h2><p className="org-privacy">Names and RSVP times are shown here. Contact details stay private.</p>
    <div className="view-tabs" role="group" aria-label="Attendee status"><button aria-pressed={status==='CONFIRMED'} onClick={()=>{setStatus('CONFIRMED');setPage(1);}}>Confirmed · {event.confirmedCount}</button><button aria-pressed={status==='WAITLISTED'} onClick={()=>{setStatus('WAITLISTED');setPage(1);}}>Waitlist · {waitingTotal}</button></div>
    <div aria-busy={busy} className="org-results" data-fetching={busy}>{roster && roster.data.length ? <><table className="attendee-table"><caption className="sr-only">{status==='CONFIRMED'?'Confirmed attendees':'Waitlist in queue order'}</caption><thead><tr>{status==='WAITLISTED'&&<th>Position</th>}<th>Name</th><th>Joined</th></tr></thead><tbody>{roster.data.map(a=><tr key={a.userId}>{status==='WAITLISTED'&&<td>#{a.waitlistPosition}</td>}<td className="attendee-table__name">{a.name}</td><td>{new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(a.rsvpedAt))}</td></tr>)}</tbody></table><Pagination meta={roster.meta} busy={busy} onPage={setPage}/></> : <EmptyState title={status==='CONFIRMED'?'Ready for your first RSVP.':'No one is waiting.'} description={status==='CONFIRMED'?'Once people reserve a place, their names will appear here.':event.waitlistEnabled?'If this event fills up, people who join the waitlist will appear here.':'The waitlist is off for this event. You can enable it in event settings.'}/>}</div>
    <section className="danger-zone"><div><h2>Remove this event</h2><p>Deleting removes the event and every RSVP. To keep its history, change its status to cancelled instead.</p></div><Button variant="danger" onClick={()=>setIsConfirmingDelete(true)}>Delete event</Button></section>
    <ConfirmDialog isOpen={isConfirmingDelete} title="Delete this event?" description={`This permanently removes the event and its RSVPs, including ${event.confirmedCount} confirmed places. This cannot be undone.`} confirmLabel="Delete event" cancelLabel="Keep event" tone="danger" isSubmitting={isDeleting} onConfirm={()=>void remove()} onCancel={()=>{if(!isDeleting)setIsConfirmingDelete(false);}}/>
  </div>;
}
