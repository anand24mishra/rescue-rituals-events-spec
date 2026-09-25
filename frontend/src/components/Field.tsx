import { useId, useState } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import './Field.css';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}

/**
 * Wires up the label, hint and error text that a field needs to be accessible.
 *
 * Centralised because getting this right per-field by hand is where it usually
 * goes wrong: the error has to be associated via `aria-describedby` and
 * announced when it appears, or a screen-reader user hears a rejected form with
 * no explanation.
 */
function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [hint !== undefined ? hintId : null, error !== undefined ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="field" data-invalid={error !== undefined}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint !== undefined ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {children({ id, describedBy })}
      {error !== undefined ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextField({ label, hint, error, ...rest }: InputProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <input
          {...rest}
          id={id}
          className="field__control"
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
        />
      )}
    </FieldShell>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextAreaField({ label, hint, error, ...rest }: TextareaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <textarea
          {...rest}
          id={id}
          className="field__control field__control--area"
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
        />
      )}
    </FieldShell>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function SelectField({ label, hint, error, children, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <div className="field__select-wrap">
          <select
            {...rest}
            id={id}
            className="field__control"
            aria-describedby={describedBy}
            aria-invalid={error !== undefined}
          >
            {children}
          </select>
          <ChevronDown
            className="field__chevron"
            aria-hidden="true"
            size={16}
            strokeWidth={1.75}
          />
        </div>
      )}
    </FieldShell>
  );
}

/** Checkbox needs the label after the control, so it does not use FieldShell. */
export function CheckboxField({
  label,
  hint,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string;
  hint?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="checkbox">
      <input
        {...rest}
        type="checkbox"
        id={id}
        className="checkbox__input"
        aria-describedby={hint !== undefined ? hintId : undefined}
      />
      <div>
        <label className="checkbox__label" htmlFor={id}>
          {label}
        </label>
        {hint !== undefined ? (
          <p className="field__hint" id={hintId}>
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function PasswordField({label, hint, error, ...rest}: Omit<InputProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  return <FieldShell label={label} hint={hint} error={error}>{({id,describedBy}) => <div className="password-field"><input {...rest} id={id} className="field__control" type={visible ? 'text' : 'password'} aria-describedby={describedBy} aria-invalid={error !== undefined}/><button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>}</FieldShell>;
}
