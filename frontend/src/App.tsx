import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { EventsPage } from './pages/EventsPage';
import { EventDetailPage } from './pages/EventDetailPage';
const EventFormPage = lazy(() => import('./pages/EventFormPage').then(m => ({default:m.EventFormPage})));
import { MyRsvpsPage } from './pages/MyRsvpsPage';
import { OrganizerEventsPage } from './pages/OrganizerEventsPage';
import { OrganizerEventDetailPage } from './pages/OrganizerEventDetailPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NotFoundPage } from './pages/NotFoundPage';
import './App.css';

/**
 * Resets scroll on navigation.
 *
 * A single-page app keeps scroll position across routes by default, which drops
 * a visitor into the middle of a page they have not seen yet.
 */
function ScrollReset() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const titles: Record<string,string> = {'/':'Explore events','/events':'Explore events','/my-rsvps':'My RSVPs','/organizer/events':'Your events','/organizer/events/new':'Host an event','/login':'Sign in','/register':'Create an account'};
    document.title = `${titles[pathname] ?? (pathname.endsWith('/edit') ? 'Edit event' : 'Event')} — Rescue Rituals`;
    document.getElementById('main')?.focus({preventScroll:true});
  }, [pathname]);

  return null;
}

/**
 * Gate for routes that need a session.
 *
 * Waits for the stored token to be validated before deciding: redirecting while
 * auth is still loading would bounce a signed-in user to the login page on
 * every hard refresh. The attempted path is remembered so they land where they
 * were going.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="route-pending" role="status">
        <span className="sr-only">Checking your session…</span>
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollReset />
      <Header />

      <main id="main" className="app-main" tabIndex={-1}>
        <Suspense fallback={<div className="route-pending" role="status">Loading event form…</div>}>
        <Routes>
          {/*
            Events discovery is the front door. There is no separate marketing
            home page: §13 lists /events as the entry point, and a hero-plus-
            cards landing page is the template shape §2.1 rules out.
          */}
          <Route path="/" element={<EventsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />

          <Route
            path="/my-rsvps"
            element={
              <RequireAuth>
                <MyRsvpsPage />
              </RequireAuth>
            }
          />

          <Route
            path="/organizer/events"
            element={
              <RequireAuth>
                <OrganizerEventsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/new"
            element={
              <RequireAuth>
                <EventFormPage mode="create" />
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/:id/edit"
            element={
              <RequireAuth>
                <EventFormPage mode="edit" />
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/:id"
            element={
              <RequireAuth>
                <OrganizerEventDetailPage />
              </RequireAuth>
            }
          />

          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </main>

      <Footer />
    </>
  );
}
