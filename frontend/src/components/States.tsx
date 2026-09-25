import type { ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { Button } from './Button';
import './States.css';

/**
 * Skeletons that preserve the layout they stand in for (§27), so the page does
 * not jump when data arrives.
 */
export function EventListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="event-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <div className="skeleton skeleton--block" />
          <div className="skeleton-card__body">
            <div className="skeleton skeleton--label" />
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line skeleton--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EventDetailSkeleton() {
  return (
    <div className="detail-skeleton" aria-hidden="true">
      <div className="skeleton skeleton--block detail-skeleton__visual" />
      <div className="detail-skeleton__body">
        <div className="skeleton skeleton--label" />
        <div className="skeleton skeleton--heading" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line skeleton--short" />
        <div className="skeleton skeleton--meter" />
      </div>
    </div>
  );
}

/** The visible skeleton is decorative; this is what a screen reader hears. */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <h2 className="state__title">{title}</h2>
      <p className="state__body">{description}</p>
      {action}
    </div>
  );
}

/**
 * Error state.
 *
 * Shows the API's own message, which is written for a person and carries the
 * specifics, plus the request id — the thing that turns "it didn't work" into a
 * report somebody can act on.
 */
export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const apiError = error instanceof ApiError ? error : null;

  return (
    <div className="state state--error" role="alert">
      <h2 className="state__title">{title}</h2>
      <p className="state__body">
        {apiError?.message ?? 'We could not load this page. Please try again.'}
      </p>
      {apiError?.requestId !== undefined ? (
        <p className="state__reference">
          Reference <code>{apiError.requestId}</code>
        </p>
      ) : null}
      {onRetry !== undefined ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
