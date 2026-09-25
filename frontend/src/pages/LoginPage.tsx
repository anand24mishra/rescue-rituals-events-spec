import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { returnPath } from '@/lib/journey';
import { PasswordField, TextField } from '@/components/Field';
import { animateAuthPage } from '@/lib/motion';
import './AuthPages.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // GSAP entrance for form elements
  useLayoutEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const ctx = animateAuthPage(el);
    return () => ctx.revert();
  }, []);

  // Where the user was heading before being asked to sign in.
  const destination = returnPath(location.state);

  const submit = async (credentials: { email: string; password: string }) => {
    const errors: Record<string,string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email)) errors.email = 'Enter a valid email address.';
    if (!credentials.password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      await login(credentials.email, credentials.password);
      void navigate(destination, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not sign in. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="shell auth">
      <div ref={formRef}>
        <h1 className="auth__title">Welcome back.</h1>
        <p className="auth__subtitle">{destination.startsWith('/events/') ? 'Sign in to save your place. We’ll take you back to the event.' : 'Your next good thing starts here.'}</p>

        <form
          className="auth__form"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            void submit({ email, password });
          }}
          noValidate
        >
          {error !== null ? (
            <p className="auth__error" role="alert">
              {error}
            </p>
          ) : null}

          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            error={fieldErrors.email}
            value={email}
            onChange={(changeEvent) => setEmail(changeEvent.target.value)}
          />

          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            required
            error={fieldErrors.password}
            value={password}
            onChange={(changeEvent) => setPassword(changeEvent.target.value)}
          />

          <Button type="submit" variant="primary" fullWidth size="lg" isLoading={isSubmitting}>
            Sign in
          </Button>
        </form>

        <p className="auth__switch">
          No account yet? <Link to="/register" state={{from:destination}}>Create one</Link>
        </p>
      </div>

      {/* Decorative right panel with a relevant photo */}
      <div className="auth__visual">
        <img
          src="/images/adoption_event.jpg"
          alt="People at an animal adoption event"
          loading="eager"
        />
        <div className="auth__visual-text"><h2>A little time.<br/>A lasting difference.</h2><p>Find your people. Show up for animals.</p></div>
      </div>
    </div>
  );
}
