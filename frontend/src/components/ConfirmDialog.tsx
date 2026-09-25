import { useRef } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Button } from './Button';
import './ConfirmDialog.css';

/**
 * A confirmation dialog.
 *
 * Used only where the choice is consequential and not obviously reversible —
 * cancelling an RSVP that will be handed to somebody on the waitlist, or
 * deleting an event (§29). Routine edits, filters and navigation do not get a
 * modal.
 *
 * The consequence is stated plainly in the body, and the confirming button says
 * what it will do rather than "OK", so the choice is readable from the buttons
 * alone.
 */
export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Keep it',
  tone = 'primary',
  isSubmitting = false,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  isSubmitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen, onCancel);

  if (!isOpen) return null;

  return (
    <div className="dialog-layer">
      {/* The backdrop is not the only way out: Escape closes, and the cancel
          button is the first focusable element. */}
      <div className="dialog-backdrop" onClick={onCancel} aria-hidden="true" />
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        ref={dialogRef}
      >
        <h2 className="dialog__title" id="dialog-title">
          {title}
        </h2>
        <p className="dialog__body" id="dialog-description">
          {description}
        </p>
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            isLoading={isSubmitting}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
