import { Link } from 'react-router-dom';
import './Footer.css';

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell shell--wide footer__inner">
        <div className="footer__brand">
          <Link to="/" className="footer__wordmark">
            Rescue<span>Rituals</span>
          </Link>
          <p className="footer__tagline">Show up for animals that need you.</p>
        </div>

        <nav className="footer__links" aria-label="Footer">
          <Link to="/events">Events</Link>
          <Link to="/my-rsvps">My RSVPs</Link>
          <a href="/docs" target="_blank" rel="noreferrer">
            API docs
          </a>
        </nav>

        <p className="footer__note">
          Demo project — fictional data only.
        </p>
      </div>
    </footer>
  );
}
