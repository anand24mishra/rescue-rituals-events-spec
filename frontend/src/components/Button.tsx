import { ArrowRight } from 'lucide-react';
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './Button.css';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Shape {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
}

const classesFor = ({ variant = 'primary', size = 'md', fullWidth, className = '' }: Shape) =>
  ['btn', `btn--${variant}`, `btn--${size}`, fullWidth === true ? 'btn--block' : '', className]
    .filter(Boolean)
    .join(' ');

interface ButtonProps
  extends Shape,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** Replaces the label while a request is in flight. */
  loadingLabel?: string;
  isLoading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    fullWidth,
    className,
    isLoading = false,
    loadingLabel = 'Working…',
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      className={classesFor({ variant, size, fullWidth, className })}
      {...rest}
      aria-busy={isLoading}
      disabled={rest.disabled === true || isLoading}
    >
      {/*
        The label is swapped for a word, not a spinner (§18.1, §27), and the
        button is sized by whichever of the two is wider — kept in the layout as
        a hidden copy — so it cannot change width mid-request and shift the
        things around it.
      */}
      <span className="btn__sizer" aria-hidden="true">
        {children}
      </span>
      <span className="btn__sizer" aria-hidden="true">
        {loadingLabel}
      </span>
      <span className="btn__label">{isLoading ? loadingLabel : children}</span>
    </button>
  );
});

export function ButtonLink({
  to,
  variant,
  size,
  fullWidth,
  className,
  children,
}: Shape & { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={classesFor({ variant, size, fullWidth, className })}>
      <span className="btn__label">{children}</span>
    </Link>
  );
}

/**
 * A text link with a trailing arrow.
 *
 * The primary way into an event from a card: Design.md §15.3 is explicit that
 * the card CTA does not need a large coloured button, and a page of them would
 * make every card shout equally.
 */
export function ArrowLink({
  to,
  children,
  className = '',
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={`arrow-link ${className}`}>
      {children}
      <ArrowRight size={16} className="arrow-link__arrow" aria-hidden="true"/>
    </Link>
  );
}
