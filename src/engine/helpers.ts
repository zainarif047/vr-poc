import type { ActionEvent, TimelineStep } from './types';

export const seqs = (evs: { seq: number }[]) => evs.map((e) => e.seq);
export const evOf = <S>(steps: TimelineStep<S>[]) => steps.map((s) => s.ev);
export const stepsOf = <S>(tl: TimelineStep<S>[], ...types: string[]) => tl.filter((s) => types.includes(s.ev.type));
export const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));
export const fmtT = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const last = <T>(a: T[]) => a[a.length - 1];
export const evidenceOf = (events: ActionEvent[], ...types: string[]) =>
  events.filter((e) => types.includes(e.type)).map((e) => e.seq);
