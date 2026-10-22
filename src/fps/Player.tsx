import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSession } from '../store/session';
import { bus, isLocked, pick, releaseLock, resetFps, rt, useFps, type ActionKey, type FpsSpec } from './runtime';

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Props {
  start: [number, number, number]; // x, z, yaw
  bounds: Box; // walkable room interior
  colliders: Box[]; // furniture footprints
  reach?: number;
}

const RADIUS = 0.34;
const EYE = 1.62;
const EYE_CROUCH = 1.12;
const WALK = 2.1;
const SENS = 0.0022;

const promptKey = (p: FpsSpec | null) => (p ? [p.id, p.title, p.sub, p.tone, ...p.actions.map((a) => a.key + a.label)].join('|') : '');

/**
 * First-person controller: pointer-lock mouse look, WASD movement with simple box collisions,
 * centre-screen interaction ray and the F / E / click / hold dispatch.
 */
export function FpsPlayer({ start, bounds, colliders, reach = 2.3 }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const setEvents = useThree((s) => s.setEvents);
  const keys = useRef(new Set<string>());
  const pos = useRef(new THREE.Vector3(start[0], 0, start[1]));
  const vel = useRef(new THREE.Vector3());
  const yaw = useRef(start[2]);
  const pitch = useRef(-0.18);
  const eye = useRef(EYE);
  const hold = useRef<{ id: string; label: string; dur: number; t0: number; run?: () => void } | null>(null);
  const lastPrompt = useRef('');
  // particle systems (sparks, leak spray) must not catch the interaction ray – three's default Points threshold is 1 m
  const ray = useRef(
    (() => {
      const r = new THREE.Raycaster();
      r.params.Points.threshold = 0.004;
      r.params.Line.threshold = 0.004;
      return r;
    })(),
  );
  const center = useRef(new THREE.Vector2(0, 0));

  const applyLook = () => {
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    camera.updateMatrixWorld();
  };

  // camera + R3F pointer events (classic click handlers must not fire under pointer lock)
  useEffect(() => {
    resetFps();
    const s = useSession.getState();
    const tool = s.state?.tool as string | undefined;
    if (tool && tool !== 'hand') useFps.setState({ belt: [tool] });
    rt.canvas = gl.domElement;
    setEvents({ enabled: false });
    const prev = { fov: camera.fov, near: camera.near };
    camera.fov = 70;
    camera.near = 0.03;
    camera.updateProjectionMatrix();
    camera.position.set(pos.current.x, EYE, pos.current.z);
    applyLook();
    // ?fpsdebug only: lets automated browser tests read / set the player pose
    const w = window as unknown as Record<string, unknown>;
    if (rt.virtual) {
      w.__fps = {
        pose: () => ({ x: pos.current.x, z: pos.current.z, yaw: yaw.current, pitch: pitch.current, focus: rt.focus?.spec.id ?? null }),
        set: (x: number, z: number, y: number, p: number) => {
          pos.current.set(x, 0, z);
          vel.current.set(0, 0, 0);
          yaw.current = y;
          pitch.current = p;
        },
        session: useSession,
        fps: useFps,
      };
    }
    return () => {
      delete w.__fps;
      releaseLock();
      setEvents({ enabled: true });
      camera.fov = prev.fov;
      camera.near = prev.near;
      camera.rotation.order = 'XYZ';
      camera.updateProjectionMatrix();
      rt.canvas = null;
      resetFps();
      useSession.setState({ hoverSlot: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    const trigger = (key: ActionKey) => {
      const f = rt.focus;
      const a = f?.spec.actions.find((x) => x.key === key && !x.custom && x.run);
      if (!a) return false;
      a.run!();
      rt.punch = performance.now();
      return true;
    };
    const cancelHold = () => {
      if (hold.current) {
        hold.current = null;
        useFps.setState({ hold: null });
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (rt.virtual && e.code === 'Escape' && useFps.getState().locked) {
        releaseLock();
        return;
      }
      if (!isLocked()) return;
      const c = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(c)) {
        keys.current.add(c);
        e.preventDefault();
        return;
      }
      if (e.repeat) return;
      if (c === 'KeyF') trigger('F');
      else if (c === 'KeyE') trigger('E');
      else if (c === 'KeyQ') rt.handlers.stow?.();
      else if (c === 'KeyR') rt.handlers.cycle?.(1);
      else if (c === 'KeyC') useFps.setState((s) => ({ crouch: !s.crouch }));
      else if (c === 'KeyH') useFps.setState((s) => ({ help: !s.help }));
      else if (/^Digit[1-9]$/.test(c)) rt.handlers.slot?.(Number(c.slice(5)));
      else return;
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onMove = (e: MouseEvent) => {
      if (!isLocked()) return;
      const k = SENS * useFps.getState().sens * rt.lookScale;
      const mx = THREE.MathUtils.clamp(e.movementX, -250, 250);
      const my = THREE.MathUtils.clamp(e.movementY, -250, 250);
      yaw.current -= mx * k;
      pitch.current = THREE.MathUtils.clamp(pitch.current - my * k, -1.45, 1.45);
      rt.sway.x += mx * 0.00012;
      rt.sway.y += my * 0.00012;
      applyLook();
      bus.emit({ type: 'look', t: e.timeStamp });
    };
    const onDown = (e: MouseEvent) => {
      if (!isLocked()) return;
      e.preventDefault();
      bus.emit({ type: 'down', button: e.button, t: e.timeStamp });
      const f = rt.focus;
      if (e.button === 0) {
        const h = f?.spec.actions.find((x) => x.key === 'HOLD' && !x.custom && x.run);
        if (h && f) {
          hold.current = { id: f.spec.id, label: h.label, dur: h.hold ?? 700, t0: performance.now(), run: h.run };
          useFps.setState({ hold: { label: h.label, progress: 0 } });
        } else trigger('LMB');
      } else if (e.button === 2) trigger('RMB');
    };
    const onUp = (e: MouseEvent) => {
      // a slow frame must not swallow a hold that was long enough
      const h = hold.current;
      if (e.button === 0 && h && performance.now() - h.t0 >= h.dur && rt.focus?.spec.id === h.id) {
        hold.current = null;
        useFps.setState({ hold: null });
        h.run?.();
        rt.punch = performance.now();
      }
      if (e.button === 0) cancelHold();
      if (isLocked() || hold.current) bus.emit({ type: 'up', button: e.button, t: e.timeStamp });
    };
    const onWheel = (e: WheelEvent) => {
      if (!isLocked()) return;
      rt.handlers.cycle?.(e.deltaY > 0 ? 1 : -1);
    };
    const release = () => {
      keys.current.clear();
      cancelHold();
      bus.emit({ type: 'release' });
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      if (rt.virtual) return;
      useFps.setState(locked ? { locked: true, entered: true, lockError: null } : { locked: false });
      if (!locked) release();
    };
    const onLockError = () =>
      useFps.setState({ lockError: 'The browser refused to capture the mouse – click the view again (Chrome waits about a second after Esc).' });
    const noMenu = (e: Event) => {
      if (isLocked()) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('contextmenu', noMenu);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
    const unsubVirtual = useFps.subscribe((s, p) => {
      if (rt.virtual && p.locked && !s.locked) release();
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('contextmenu', noMenu);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      unsubVirtual();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    const locked = isLocked();
    const fs = useFps.getState();
    const k = keys.current;

    // ── movement ──
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const wish = new THREE.Vector3();
    if (locked && !rt.frozen && (fwd || str)) {
      const sy = Math.sin(yaw.current),
        cy = Math.cos(yaw.current);
      wish.set(-sy * fwd + cy * str, 0, -cy * fwd - sy * str).normalize();
      const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
      wish.multiplyScalar(WALK * (fs.crouch ? 0.5 : sprint ? 1.6 : 1));
    }
    vel.current.lerp(wish, 1 - Math.exp(-dt * 12));
    const p = pos.current;
    p.addScaledVector(vel.current, dt);
    // collisions: room bounds, then furniture footprints expanded by the body radius
    p.x = THREE.MathUtils.clamp(p.x, bounds.minX + RADIUS, bounds.maxX - RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, bounds.minZ + RADIUS, bounds.maxZ - RADIUS);
    for (const b of colliders) {
      const x0 = b.minX - RADIUS,
        x1 = b.maxX + RADIUS,
        z0 = b.minZ - RADIUS,
        z1 = b.maxZ + RADIUS;
      if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
        const dx = Math.min(p.x - x0, x1 - p.x);
        const dz = Math.min(p.z - z0, z1 - p.z);
        if (dx < dz) p.x = p.x - x0 < x1 - p.x ? x0 : x1;
        else p.z = p.z - z0 < z1 - p.z ? z0 : z1;
      }
    }
    const speed = vel.current.length();
    rt.moveAmt = Math.min(1, speed / WALK);
    rt.bob += dt * (6 + speed * 2.4) * (rt.moveAmt > 0.05 ? 1 : 0);
    rt.sway.x *= Math.exp(-dt * 10);
    rt.sway.y *= Math.exp(-dt * 10);
    eye.current += ((fs.crouch ? EYE_CROUCH : EYE) - eye.current) * Math.min(1, dt * 10);
    camera.position.set(p.x, eye.current + Math.sin(rt.bob * 2) * 0.018 * rt.moveAmt, p.z);
    applyLook();

    // ── focus ──
    let next: typeof rt.focus = null;
    if (locked && !fs.modal) {
      ray.current.setFromCamera(center.current, camera);
      ray.current.far = reach;
      next = pick(ray.current);
    }
    rt.focus = next;
    const key = promptKey(next?.spec ?? null);
    if (key !== lastPrompt.current) {
      lastPrompt.current = key;
      useFps.setState({ prompt: next?.spec ?? null });
    }

    // ── hold-to-use ──
    const h = hold.current;
    if (h) {
      const still = next?.spec.id === h.id && next.spec.actions.some((a) => a.key === 'HOLD' && a.label === h.label);
      if (!locked || !still) {
        hold.current = null;
        useFps.setState({ hold: null });
      } else {
        const prog = (performance.now() - h.t0) / h.dur;
        if (prog >= 1) {
          hold.current = null;
          useFps.setState({ hold: null });
          h.run?.();
          rt.punch = performance.now();
        } else useFps.setState({ hold: { label: h.label, progress: prog } });
      }
    }
  });

  return null;
}
