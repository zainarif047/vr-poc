import { useEffect, useRef, type RefObject } from 'react';
import type * as THREE from 'three';
import { create } from 'zustand';
import { useSession } from '../store/session';

// First-person ("game") mode runtime: interaction registry, input bus, pointer-lock helpers.
// Everything here only produces the same `act()` calls the classic UI makes – the engine is unchanged.

export type ActionKey = 'F' | 'E' | 'LMB' | 'RMB' | 'HOLD';
export interface FpsAction {
  key: ActionKey;
  label: string;
  run?: () => void;
  hold?: number; // ms the button must be held (HOLD only)
  custom?: boolean; // handled by a scene controller (e.g. welding), the player only shows the prompt
}
export interface FpsSpec {
  id: string;
  title: string;
  sub?: string;
  tone?: 'ok' | 'warn' | 'bad';
  actions: FpsAction[];
}
export type SpecFn = (hit: THREE.Intersection) => FpsSpec | null;

export type Modal = null | 'machine' | 'jobcard';

const SENS_KEY = 'artilence-fps-sens';
const loadSens = () => {
  try {
    const v = Number(localStorage.getItem(SENS_KEY));
    return v > 0.1 && v < 4 ? v : 1;
  } catch {
    return 1;
  }
};

interface FpsStore {
  locked: boolean;
  entered: boolean; // has the candidate entered the workshop at least once
  modal: Modal;
  help: boolean;
  prompt: FpsSpec | null;
  hold: { label: string; progress: number } | null;
  held: string | null; // welder hand item (torch, brush, …); plumber uses session.armed / state.tool
  belt: string[]; // plumber tools taken from the shadow board
  crouch: boolean;
  welding: boolean;
  lockError: string | null;
  sens: number;
}

export const useFps = create<FpsStore>(() => ({
  locked: false,
  entered: false,
  modal: null,
  help: false,
  prompt: null,
  hold: null,
  held: null,
  belt: [],
  crouch: false,
  welding: false,
  lockError: null,
  sens: loadSens(),
}));

export function setSens(v: number) {
  useFps.setState({ sens: v });
  try {
    localStorage.setItem(SENS_KEY, String(v));
  } catch {
    /* storage unavailable */
  }
}

/** Mutable per-frame runtime shared by the player, viewmodel and scene controllers (not reactive). */
export const rt = {
  canvas: null as HTMLCanvasElement | null,
  virtual: typeof location !== 'undefined' && /[?&]fpsdebug\b/.test(location.search), // test mode: no real pointer lock
  focus: null as { spec: FpsSpec; hit: THREE.Intersection } | null,
  lookScale: 1,
  frozen: false,
  bob: 0,
  moveAmt: 0,
  sway: { x: 0, y: 0 },
  punch: 0,
  torchOnSeam: false,
  handlers: {} as { stow?: () => void; slot?: (n: number) => void; cycle?: (d: number) => void },
};

// ───────────── input bus (raw button / look events for continuous controllers) ─────────────
export type BusEvent = { type: 'down' | 'up'; button: number; t: number } | { type: 'look'; t: number } | { type: 'release' };
const subs = new Set<(e: BusEvent) => void>();
export const bus = {
  on(fn: (e: BusEvent) => void) {
    subs.add(fn);
    return () => void subs.delete(fn);
  },
  emit(e: BusEvent) {
    subs.forEach((f) => f(e));
  },
};

// ───────────── interaction registry ─────────────
const interactables = new Map<THREE.Object3D, SpecFn>();
const blockers = new Set<THREE.Object3D>();

/** Registers an object (and its children) as something the crosshair can focus. */
export function useInteractable(ref: RefObject<THREE.Object3D | null>, fn: SpecFn, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const o = ref.current;
    if (!o || !enabled) return;
    interactables.set(o, (h) => fnRef.current(h));
    return () => void interactables.delete(o);
  }, [ref, enabled]);
}

/** Solid scenery that stops the interaction ray (walls, benches, the table). */
export function useBlocker(ref: RefObject<THREE.Object3D | null>, enabled = true) {
  useEffect(() => {
    const o = ref.current;
    if (!o || !enabled) return;
    blockers.add(o);
    return () => void blockers.delete(o);
  }, [ref, enabled]);
}

export function pick(raycaster: THREE.Raycaster): { spec: FpsSpec; hit: THREE.Intersection } | null {
  if (!interactables.size) return null;
  const hits = raycaster.intersectObjects([...interactables.keys(), ...blockers], true);
  for (const h of hits) {
    let o: THREE.Object3D | null = h.object;
    while (o && !interactables.has(o) && !blockers.has(o)) o = o.parent;
    if (!o) continue;
    if (blockers.has(o)) return null;
    const spec = interactables.get(o)!(h);
    if (spec) return { spec, hit: h };
  }
  return null;
}

// ───────────── pointer lock ─────────────
export const isLocked = () => (rt.virtual ? useFps.getState().locked : !!rt.canvas && document.pointerLockElement === rt.canvas);

export function requestLock() {
  const c = rt.canvas;
  if (!c || useSession.getState().phase !== 'active') return;
  if (rt.virtual) {
    useFps.setState({ locked: true, entered: true, lockError: null });
    return;
  }
  const fail = () =>
    useFps.setState({ lockError: 'The browser needs a moment before it can capture the mouse again – click once more.' });
  try {
    const r = c.requestPointerLock() as unknown as Promise<void> | undefined;
    if (r && typeof r.then === 'function') r.catch(fail);
  } catch {
    fail();
  }
}

export function releaseLock() {
  if (rt.virtual) {
    useFps.setState({ locked: false });
    bus.emit({ type: 'release' });
    return;
  }
  if (document.pointerLockElement) document.exitPointerLock();
}

export function openModal(m: Exclude<Modal, null>) {
  useFps.setState({ modal: m, help: false });
  releaseLock();
}

/** Must be called from a click handler so the browser accepts the pointer-lock request. */
export function closeModal(relock = true) {
  useFps.setState({ modal: null });
  if (relock) requestLock();
}

export function resetFps() {
  rt.focus = null;
  rt.frozen = false;
  rt.lookScale = 1;
  rt.torchOnSeam = false;
  rt.handlers = {};
  useFps.setState({ locked: false, entered: false, modal: null, help: false, prompt: null, hold: null, held: null, belt: [], crouch: false, welding: false, lockError: null });
}

/** True while the first-person controls drive the scene (replays always use the classic orbit camera). */
export const useFpsActive = () => useSession((s) => s.view === 'fps' && s.phase !== 'replaying');
export const fpsActiveNow = () => {
  const s = useSession.getState();
  return s.view === 'fps' && s.phase !== 'replaying';
};

export const KEY_LABEL: Record<ActionKey, string> = { F: 'F', E: 'E', LMB: 'Click', RMB: 'Right-click', HOLD: 'Hold click' };
