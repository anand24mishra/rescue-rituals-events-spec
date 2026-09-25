import { useLayoutEffect, useRef } from 'react';
import {
  animateDetailHero,
  animateDetailSections,
  animateHeader,
  animateHero,
  enterList,
} from '@/lib/motion';

/**
 * Applies the list entrance to `[data-enter]` descendants.
 *
 * The returned context is reverted on cleanup, which is what makes GSAP safe in
 * React: every tween created inside it is tracked, and `revert()` undoes both
 * the animations and the inline styles they left behind.
 */
export function useListEntrance(
  dependencies: unknown[] = [],
): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const context = enterList(element);
    return () => context.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return ref;
}

/**
 * Animates the hero section (title, lede, filter bar) on mount.
 */
export function useHeroAnimation(): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const context = animateHero(element);
    return () => context.revert();
  }, []);

  return ref;
}

/**
 * Animates the header on first page load.
 */
export function useHeaderAnimation(): React.RefObject<HTMLElement> {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const context = animateHeader(element);
    return () => context.revert();
  }, []);

  return ref;
}

/**
 * Animates the event detail page hero (visual + intro columns).
 */
export function useDetailHeroAnimation(): React.RefObject<HTMLElement> {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const context = animateDetailHero(element);
    return () => context.revert();
  }, []);

  return ref;
}

/**
 * Applies scroll-triggered fade-ins to detail page sections.
 */
export function useDetailSections(): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const context = animateDetailSections(element);
    return () => context.revert();
  }, []);

  return ref;
}
