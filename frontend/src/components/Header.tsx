import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button, ButtonLink } from './Button';
import { useHeaderAnimation } from '@/hooks/useMotion';
import './Header.css';

/**
 * Navigation.
 *
 * Now with a GSAP slide-in animation on mount and a glassmorphism backdrop
 * when scrolled, giving the header a premium, polished feel.
 */
export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useHeaderAnimation();

  // Navigation closes the mobile menu; leaving it open afterwards is a small
  // bug that makes an app feel unfinished.
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Escape closes it, and focus returns to the control that opened it.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  // Track scroll position for glass-morphism effect
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const signOut = () => {
    logout();
    void navigate('/');
  };

  return (
    <header
      className={`masthead${isScrolled ? ' masthead--scrolled' : ''}`}
      ref={headerRef as React.RefObject<HTMLHeadingElement>}
    >
      <div className="masthead__inner shell shell--wide">
        <Link to="/" className="wordmark">
          Rescue<span className="wordmark__second">Rituals</span>
        </Link>

        <nav className="masthead__nav" aria-label="Main">
          <NavLink to="/events" className="nav-link">
            Explore events
          </NavLink>
          {user !== null ? (
            <>
              <NavLink to="/my-rsvps" className="nav-link">
                My RSVPs
              </NavLink>
              <NavLink to="/organizer/events" className="nav-link">
                Your events
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className="masthead__actions">
          {user === null ? (
            <>
              <ButtonLink to="/login" variant="quiet" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink to="/register" variant="primary" size="sm">
                Create account
              </ButtonLink>
            </>
          ) : (
            <>
              <div className="masthead__user-info">
                <span className="masthead__who">{user.name}</span>

              </div>
              <Button variant="quiet" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          )}
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          className="masthead__toggle"
          aria-expanded={isOpen}
          aria-controls="mobile-menu"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
          {isOpen ? (
            <X aria-hidden="true" size={20} strokeWidth={1.75} />
          ) : (
            <Menu aria-hidden="true" size={20} strokeWidth={1.75} />
          )}
        </button>
      </div>

      {/* Hidden from assistive technology when closed, so its links are not
          reachable by tab or screen reader while off-screen. */}
      <div className="masthead__mobile" id="mobile-menu" hidden={!isOpen}>
        <nav className="masthead__mobile-nav" aria-label="Mobile">
          <NavLink to="/events" className="nav-link">
            Explore events
          </NavLink>
          {user !== null ? (
            <>
              <NavLink to="/my-rsvps" className="nav-link">
                My RSVPs
              </NavLink>
              <NavLink to="/organizer/events" className="nav-link">
                Your events
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className="masthead__mobile-actions">
          {user === null ? (
            <>
              <ButtonLink to="/login" variant="secondary">
                Sign in
              </ButtonLink>
              <ButtonLink to="/register" variant="primary">
                Create account
              </ButtonLink>
            </>
          ) : (
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
