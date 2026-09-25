import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import './Toast.css';

type Tone = 'neutral' | 'error';

interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  /**
   * Shows a brief confirmation.
   *
   * For small, transient acknowledgements only — "Event saved", "Changes
   * saved". Business state such as whether an RSVP is confirmed or waitlisted
   * belongs in the page itself (§28), where it survives the toast disappearing
   * and is available to somebody who was not looking at the corner of the
   * screen when it appeared.
   */
  notify: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DISMISS_AFTER_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message: string, tone: Tone = 'neutral') => {
    const id = nextId.current++;
    // At most two: a taller stack covers content and stops being glanceable,
    // which is the only thing a toast is good for.
    setToasts((current) => [...current.slice(-1), { id, tone, message }]);
  }, []);

  const value = useMemo<ToastApi>(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Polite, so it is announced without interrupting what the user is
          doing. An assertive region here would talk over form validation. */}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const [isPaused, setIsPaused] = useState(false);

  // Hovering pauses the countdown: a message that vanishes mid-read is worse
  // than no message.
  useEffect(() => {
    if (isPaused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), DISMISS_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [isPaused, onDismiss, toast.id]);

  return (
    <div
      className={`toast toast--${toast.tone}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <p className="toast__message">{toast.message}</p>
      <button
        type="button"
        className="toast__close"
        onClick={() => onDismiss(toast.id)}
      >
        <span className="sr-only">Dismiss</span>
        <X aria-hidden="true" size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return context;
}
