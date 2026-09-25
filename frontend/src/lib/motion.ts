import gsap from 'gsap';
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const MOTION = {micro:.14, standard:.22, entrance:.22, ease:'power3.out'} as const;
export function initMotion() { gsap.defaults({ease:MOTION.ease, duration:MOTION.standard}); }
// Task screens render immediately. Motion is reserved for feedback, not access to content.
const staticContext = (container: HTMLElement) => gsap.context(() => {}, container);
export const animateHero = staticContext;
export const animateHeader = staticContext;
export const animateDetailHero = staticContext;
export const animateDetailSections = staticContext;
export const animateAuthPage = staticContext;
export const enterList = staticContext;
export function pulseChip(chip: HTMLElement) {
  if (!prefersReducedMotion()) gsap.fromTo(chip,{scale:.98},{scale:1,duration:.14,clearProps:'transform'});
}
export function tweenMeter(fill: HTMLElement, ratio: number): gsap.core.Tween | null {
  if (prefersReducedMotion()) { gsap.set(fill,{scaleX:ratio}); return null; }
  return gsap.to(fill,{scaleX:ratio,duration:.22});
}
export function tweenNumber(from: number, to: number, onUpdate: (value:number) => void): gsap.core.Tween | null {
  if (prefersReducedMotion() || from === to) { onUpdate(to); return null; }
  const state = {value:from};
  return gsap.to(state,{value:to,duration:.22,onUpdate:() => onUpdate(Math.round(state.value))});
}
export {gsap};
