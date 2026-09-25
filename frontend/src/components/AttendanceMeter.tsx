import { useEffect, useRef, useState } from 'react';
import { tweenMeter, tweenNumber } from '@/lib/motion';
import './AttendanceMeter.css';

/**
 * The attendance meter (§35).
 *
 * The rules it follows, all from the design contract: a subtle track, a solid
 * green fill with no gradient, and text that states the numbers so colour is
 * never the only signal.
 *
 * The fill eases and the count ticks because attendance is the one number on
 * the page that changes as a direct result of what the user just did. Seeing 71
 * become 72 is the feedback; a silently different number is not.
 */
export function AttendanceMeter({
  confirmedCount,
  capacity,
  size = 'md',
}: {
  confirmedCount: number;
  capacity: number | null;
  size?: 'sm' | 'md';
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const [displayCount, setDisplayCount] = useState(confirmedCount);
  const previous = useRef(confirmedCount);

  const ratio =
    capacity === null || capacity === 0 ? 0 : Math.min(1, confirmedCount / capacity);
  const isFull = capacity !== null && confirmedCount >= capacity;

  useEffect(() => {
    const tween = tweenNumber(previous.current, confirmedCount, setDisplayCount);
    previous.current = confirmedCount;
    return () => {
      tween?.kill();
    };
  }, [confirmedCount]);

  useEffect(() => {
    const fill = fillRef.current;
    if (fill === null) return;
    const tween = tweenMeter(fill, ratio);
    return () => {
      tween?.kill();
    };
  }, [ratio]);

  if (capacity === null) {
    return (
      <p className={`meter__summary meter__summary--${size}`}>
        <strong>{displayCount}</strong>{' '}
        {displayCount === 1 ? 'person confirmed' : 'people confirmed'}
        <span className="meter__aside"> · No capacity limit</span>
      </p>
    );
  }

  const remaining = Math.max(0, capacity - confirmedCount);

  return (
    <div className={`meter meter--${size}`} data-full={isFull}>
      <div
        className="meter__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={confirmedCount}
        // The meaning, not the geometry. A screen reader should hear what the
        // bar is for, not that a div is 72% wide.
        aria-label={`${confirmedCount} of ${capacity} places confirmed`}
      >
        <div className="meter__fill" ref={fillRef} style={{ transform: 'scaleX(0)' }} />
      </div>

      <p className={`meter__summary meter__summary--${size}`}>
        <strong>{displayCount} confirmed</strong>
        <span className="meter__aside">
          {' · '}
          {isFull ? 'Event full' : `${remaining} spot${remaining === 1 ? '' : 's'} left`}
        </span>
      </p>
    </div>
  );
}
