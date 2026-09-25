import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { returnPath } from '@/lib/journey';
import { PasswordField, TextField } from '@/components/Field';
import { animateAuthPage } from '@/lib/motion';
import './AuthPages.css';

/** Mirrors the API's MIN_PASSWORD_LENGTH so the hint matches what is enforced. */
const MIN_PASSWORD_LENGTH = 10;

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // GSAP entrance for form elements
  useLayoutEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const ctx = animateAuthPage(el);
    return () => ctx.revert();
  }, []);

  const destination = returnPath(location.state);

  /**
   * Client-side checks mirror the server's rules to give immediate feedback.
   */
  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length === 0) errors.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async () => {
    if (!validate()) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()); return; }

    setError(null);
    setIsSubmitting(true);
    try {
      await register(name, email, password);
      void navigate(destination, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'EMAIL_ALREADY_REGISTERED') {
        setFieldErrors({ email: 'That email address is already registered.' });
      } else {
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Could not create your account. Please try again.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="shell auth">
      <div ref={formRef}>
        <h1 className="auth__title">Create an account</h1>
        <p className="auth__subtitle">
          Name, email, password. Nothing else needed.
        </p>

        <form
          className="auth__form"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            void submit();
          }}
          noValidate
        >
          {error !== null ? (
            <p className="auth__error" role="alert">
              {error}
            </p>
          ) : null}

          <TextField
            label="Your name"
            name="name"
            autoComplete="name"
            required
            value={name}
            error={fieldErrors.name}
            onChange={(changeEvent) => setName(changeEvent.target.value)}
          />

          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            error={fieldErrors.email}
            onChange={(changeEvent) => setEmail(changeEvent.target.value)}
          />

          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            error={fieldErrors.password}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters. Length matters more than symbols — a short phrase works well.`}
            onChange={(changeEvent) => setPassword(changeEvent.target.value)}
          />

          <Button type="submit" fullWidth size="lg" isLoading={isSubmitting}>
            Create account
          </Button>
        </form>

        <p className="auth__switch">
          Already registered? <Link to="/login" state={{from:destination}}>Sign in</Link>
        </p>
      </div>

      {/* Decorative right panel */}
      <div className="auth__visual">
        <img
          src="/images/community_meetup.jpg"
          alt="Community meetup with dogs in a park"
          loading="eager"
        />
        <div className="auth__visual-text"><h2>A little time.<br/>A lasting difference.</h2><p>Find your people. Show up for animals.</p></div>
      </div>
    </div>
  );
}
