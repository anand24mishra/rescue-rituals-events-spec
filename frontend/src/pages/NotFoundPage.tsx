import { ButtonLink } from '@/components/Button';
import './NotFoundPage.css';

export function NotFoundPage() {
  return (
    <div className="page shell notfound">
      <h1 className="notfound__title">We couldn&rsquo;t find that page.</h1>
      <p className="notfound__body">
        The link may be outdated, or the event may have been removed by its
        organizer.
      </p>
      <div className="notfound__actions">
        <ButtonLink to="/events">Browse events</ButtonLink>
      </div>
    </div>
  );
}
