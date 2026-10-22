import { Label as Html } from '../common/Label';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { scenarioById } from '../../engine';
import { part as partSpec } from '../../engine/plumber/catalog';
import { K, PartModel } from './PartModel';
import { ELBOW_R, TEE_LEN, boundsOf, layoutRoute, type SlotDef, type SlotGeom } from '../../engine/plumber/layout';
import type { PlumberParams, PlumberState } from '../../engine/plumber/reducer';
import type { Scenario } from '../../engine/types';
import { useSession } from '../../store/session';
import { mats } from '../common/materials';
import { Controls, Lights, RecorderBridge, Workshop } from '../common/Rig';
import { fpsActiveNow, useFpsActive, useInteractable, type FpsAction, type FpsSpec } from '../../fps/runtime';
import { PLUMBER_ROOM, PlumberFps, PlumberStations, toolLabel } from './PlumberStations';

const Z = 0.075; // pipe centre-line distance from wall
const BASE_Y = 1.0;

// meshes that accept drops/clicks, registered for the drag controller
const slotHits = new Map<string, THREE.Object3D>();

function hitBox(def: SlotDef, geom: SlotGeom): { size: [number, number, number]; pos: [number, number, number] } {
  const t = 0.1;
  switch (def.kind) {
    case 'elbow': {
      const R = ELBOW_R * K;
      const s = def.turn === 'R' ? -1 : 1;
      return { size: [R * 1.6, R * 1.6, t], pos: [R * 0.5, s * R * 0.5, 0] };
    }
    case 'tee':
      return { size: [TEE_LEN * K, 0.14, t], pos: [(TEE_LEN * K) / 2, def.branch === 'R' ? -0.05 : 0.05, 0] };
    default:
      return { size: [Math.max(geom.span, 40) * K, 0.12, t], pos: [(Math.max(geom.span, 40) * K) / 2, 0, 0] };
  }
}

// ───────────────────────── slot ─────────────────────────
function Slot({ def, geom, world }: { def: SlotDef; geom: SlotGeom; world: (x: number, y: number) => [number, number] }) {
  const st = useSession((s) => (s.state as PlumberState).slots[def.id]);
  const hover = useSession((s) => s.hoverSlot === def.id);
  const armed = useSession((s) => !!s.armed);
  const measured = useSession((s) => (s.state as PlumberState).measured[def.id]);
  const lastTest = useSession((s) => (s.state as PlumberState).lastTest);
  const leaking = useSession((s) => (s.state as PlumberState).leaks.includes(def.id));
  const flagged = useSession((s) => (s.state as PlumberState).flagged.includes(def.id));
  const [wx, wy] = world(geom.x, geom.y);
  const hit = hitBox(def, geom);
  const grow = useRef<THREE.Group>(null);
  const hitRef = useRef<THREE.Mesh | null>(null);
  const fps = useFpsActive();
  useInteractable(hitRef, () => slotSpec(def), fps);
  const placedAt = useRef(0);
  const partId = st.part;
  useEffect(() => {
    placedAt.current = performance.now();
  }, [partId]);
  useFrame(() => {
    if (!grow.current) return;
    const k = Math.min(1, (performance.now() - placedAt.current) / 260);
    const e = 1 - Math.pow(1 - k, 3);
    grow.current.scale.setScalar(0.88 + 0.12 * e);
    grow.current.position.y = (1 - e) * 0.05;
  });

  const spec = partId ? partSpec(partId) : null;
  const mid = new THREE.Vector3(Math.cos(geom.ang) * geom.span * 0.5 * K, Math.sin(geom.ang) * geom.span * 0.5 * K, 0);

  return (
    <group position={[wx, wy, Z]} rotation={[0, 0, geom.ang]}>
      {!spec && (
        <PartModel
          kind={def.kind}
          dia={15}
          material="copper"
          len={def.len ?? 0}
          turn={def.turn ?? 'L'}
          side={def.branch ?? 'L'}
          ghost={hover || armed ? 'hot' : 'ghost'}
          tight={false}
        />
      )}
      {spec && (
        <group ref={grow}>
          <PartModel
            kind={spec.kind}
            dia={spec.dia}
            material={spec.material}
            len={spec.len ?? 0}
            turn={def.turn ?? 'L'}
            side={def.branch ?? 'L'}
            tight={st.tight}
            defective={spec.defective}
          />
        </group>
      )}
      <mesh
        position={hit.pos}
        userData={{ slotId: def.id }}
        ref={(m) => {
          hitRef.current = m;
          if (m) slotHits.set(def.id, m);
          else slotHits.delete(def.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          useSession.setState({ hoverSlot: def.id });
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          useSession.setState({ hoverSlot: null });
          document.body.style.cursor = '';
        }}
        onClick={(e) => {
          e.stopPropagation();
          slotClick(def.id);
        }}
        material={mats().invisible}
      >
        <boxGeometry args={hit.size} />
      </mesh>
      <Html position={[geom.span * 0.5 * K * Math.cos(0), -0.13, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
        <div className={`chip ${flagged ? 'chip-flag' : ''}`}>
          <b>{def.id.replace('s', '')}</b>
          {measured !== undefined && <span> · {measured} mm</span>}
          {flagged && <span> · 📍 leak</span>}
        </div>
      </Html>
      {leaking && lastTest === 'leak' && <Spray position={mid.toArray() as [number, number, number]} dir={geom.ang} />}
    </group>
  );
}

/** First-person prompt for a slot: what the click / hold will do with the part or tool in hand. */
function slotSpec(def: SlotDef): FpsSpec {
  const s = useSession.getState();
  const st = s.state as PlumberState;
  const cur = st.slots[def.id];
  const fitted = cur.part ? partSpec(cur.part) : null;
  const run = () => slotClick(def.id);
  const actions: FpsAction[] = [];
  if (s.armed) actions.push({ key: 'LMB', label: `Fit ${partSpec(s.armed).label}`, run });
  else
    switch (st.tool) {
      case 'tape':
        actions.push({ key: 'LMB', label: 'Measure', run });
        break;
      case 'wrench':
      case 'hammer':
      case 'pliers':
        if (fitted) actions.push({ key: 'HOLD', label: st.tool === 'wrench' ? 'Tighten joint' : `Tighten with ${toolLabel(st.tool).toLowerCase()}`, hold: 650, run });
        break;
      case 'marker':
        actions.push({ key: 'LMB', label: st.flagged.includes(def.id) ? 'Remove leak tag' : 'Tag as leaking', run });
        break;
      default:
        if (fitted) actions.push({ key: 'LMB', label: 'Remove part', run });
    }
  return {
    id: 'slot:' + def.id,
    title: def.label,
    sub: fitted ? `${fitted.label} · ${fitted.sub} · ${cur.tight ? 'tightened' : 'not tightened'}` : 'Empty position',
    actions,
  };
}

/** Click rules for a slot depending on armed part and selected tool. */
export function slotClick(id: string) {
  const s = useSession.getState();
  if (s.phase !== 'active') return;
  const st = s.state as PlumberState;
  const scn = scenarioById(s.scenarioId) as Scenario<PlumberParams>;
  const def = scn.params.slots.find((d) => d.id === id)!;
  const geoms = layoutRoute(scn.params.slots);
  if (s.armed) {
    if (s.act('place', id, { part: s.armed })) useSession.setState({ armed: null });
    return;
  }
  switch (st.tool) {
    case 'tape': {
      const mm = def.kind === 'pipe' ? def.len! : Math.round(geoms[id].span);
      if (s.act('measure', id, { mm })) {
        useSession.setState({ lastMeasure: { id, mm } });
        if (fpsActiveNow()) s.toastMsg(`📏 Position ${id.replace('s', '')}: ${mm} mm`, 'info');
      }
      break;
    }
    case 'wrench':
    case 'hammer':
    case 'pliers':
      s.act('tighten', id);
      break;
    case 'marker':
      s.act('flag_leak', id);
      break;
    case 'hand':
    default:
      if (st.slots[id].part) s.act('remove', id);
      else s.toastMsg(fpsActiveNow() ? 'Pick up a component from the stores first (F).' : 'Select a component from the tray, then click this position.', 'info');
  }
}

// ───────────────────────── leak spray ─────────────────────────
function Spray({ position, dir }: { position: [number, number, number]; dir: number }) {
  const N = 70;
  const ref = useRef<THREE.Points>(null);
  const data = useMemo(() => {
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const life = new Float32Array(N);
    for (let i = 0; i < N; i++) life[i] = Math.random();
    return { pos, vel, life };
  }, []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const { pos, vel, life } = data;
    for (let i = 0; i < N; i++) {
      life[i] -= dt * 0.9;
      if (life[i] <= 0) {
        life[i] = 0.6 + Math.random() * 0.5;
        pos[i * 3] = 0;
        pos[i * 3 + 1] = -0.02;
        pos[i * 3 + 2] = 0.03;
        const a = Math.random() * Math.PI * 2;
        const sp = 0.35 + Math.random() * 0.5;
        vel[i * 3] = Math.cos(a) * 0.12;
        vel[i * 3 + 1] = -0.1 + Math.random() * 0.2;
        vel[i * 3 + 2] = Math.abs(Math.sin(a)) * sp;
      } else {
        vel[i * 3 + 1] -= 1.8 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
    }
    (ref.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return (
    <group position={position} rotation={[0, 0, -dir]}>
      <points ref={ref} material={mats().water}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
        </bufferGeometry>
      </points>
    </group>
  );
}

// ───────────────────────── supply side furniture ─────────────────────────
function Pipe3({ a, b, r, mat }: { a: [number, number, number]; b: [number, number, number]; r: number; mat: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a),
      vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return { pos: va.clone().add(vb).multiplyScalar(0.5), quat: q, len: d.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow receiveShadow material={mat}>
      <cylinderGeometry args={[r, r, len, 24]} />
    </mesh>
  );
}

function Stopcock({ x }: { x: number }) {
  const supply = useSession((s) => (s.state as PlumberState).supply);
  const lever = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  useInteractable(
    root,
    () => {
      const open = (useSession.getState().state as PlumberState).supply === 'open';
      return {
        id: 'stopcock',
        title: 'Mains stopcock',
        sub: open ? 'OPEN – pipework is live' : 'CLOSED – supply isolated',
        tone: open ? 'warn' : 'ok',
        actions: [{ key: 'E', label: open ? 'Close (isolate supply)' : 'Open (restore supply)', run: () => useSession.getState().act(open ? 'isolate' : 'restore') }],
      };
    },
    useFpsActive(),
  );
  const M = mats();
  useFrame((_, dt) => {
    if (!lever.current) return;
    const target = supply === 'isolated' ? -Math.PI / 2 : 0;
    lever.current.rotation.z += (target - lever.current.rotation.z) * Math.min(1, dt * 10);
  });
  const click = (e: any) => {
    e.stopPropagation();
    const s = useSession.getState();
    if (s.phase !== 'active') return;
    s.act(supply === 'open' ? 'isolate' : 'restore');
  };
  return (
    <group ref={root} position={[x, 0.62, Z]}>
      <mesh castShadow material={M.brass} onClick={click} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <boxGeometry args={[0.1, 0.16, 0.1]} />
      </mesh>
      <mesh position={[0, 0.0, 0.07]} rotation={[Math.PI / 2, 0, 0]} castShadow material={M.brass}>
        <cylinderGeometry args={[0.025, 0.025, 0.07, 16]} />
      </mesh>
      <group ref={lever} position={[0, 0, 0.1]}>
        <mesh position={[0, 0.1, 0]} castShadow material={M.redPaint} onClick={click} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
          <boxGeometry args={[0.045, 0.22, 0.03]} />
        </mesh>
      </group>
      <Html position={[0.2, 0.06, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`chip ${supply === 'isolated' ? 'chip-ok' : 'chip-warn'}`}>Mains stopcock · {supply === 'isolated' ? 'CLOSED' : 'OPEN'}</div>
      </Html>
    </group>
  );
}

function DrainCock({ x }: { x: number }) {
  const M = mats();
  const drained = useSession((s) => (s.state as PlumberState).drained);
  const root = useRef<THREE.Group>(null);
  useInteractable(
    root,
    () => {
      const st = useSession.getState().state as PlumberState;
      return {
        id: 'drain',
        title: 'Drain cock',
        sub: st.drained ? 'Line drained · 0 bar' : `Closed · line at ${st.pressure.toFixed(1)} bar`,
        actions: [{ key: 'E', label: 'Open drain cock', run: () => useSession.getState().act('drain') }],
      };
    },
    useFpsActive(),
  );
  return (
    <group ref={root} position={[x, 0.3, Z]}>
      <mesh
        castShadow
        material={M.brass}
        onClick={(e) => {
          e.stopPropagation();
          const s = useSession.getState();
          if (s.phase === 'active') s.act('drain');
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[0.09, 0.09, 0.09]} />
      </mesh>
      <mesh position={[0.1, 0, 0.0]} rotation={[0, 0, Math.PI / 2]} castShadow material={M.brass}>
        <cylinderGeometry args={[0.02, 0.02, 0.12, 16]} />
      </mesh>
      <mesh position={[0.17, 0, 0]} castShadow material={M.bluePaint}>
        <boxGeometry args={[0.04, 0.09, 0.05]} />
      </mesh>
      <Html position={[0.28, 0, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`chip ${drained ? 'chip-ok' : ''}`}>Drain cock{drained ? ' · drained' : ''}</div>
      </Html>
    </group>
  );
}

function Gauge({ x, y }: { x: number; y: number }) {
  const bar = useSession((s) => (s.state as PlumberState).pressure);
  const needle = useRef<THREE.Group>(null);
  const M = mats();
  const cur = useRef(bar);
  useFrame((_, dt) => {
    cur.current += (bar - cur.current) * Math.min(1, dt * 3);
    if (needle.current) needle.current.rotation.z = THREE.MathUtils.degToRad(225 - (cur.current / 6) * 270) - Math.PI / 2;
  });
  return (
    <group position={[x, y, Z + 0.06]}>
      <mesh position={[0, -0.09, -0.04]} castShadow material={M.brass}>
        <cylinderGeometry args={[0.025, 0.025, 0.18, 16]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow material={M.steel}>
        <cylinderGeometry args={[0.1, 0.1, 0.05, 40]} />
      </mesh>
      <mesh position={[0, 0, 0.0265]} material={M.gaugeFace}>
        <circleGeometry args={[0.088, 40]} />
      </mesh>
      <group ref={needle} position={[0, 0, 0.032]}>
        <mesh position={[0, 0.036, 0]}>
          <boxGeometry args={[0.006, 0.075, 0.003]} />
          <meshBasicMaterial color="#c0221b" />
        </mesh>
      </group>
      <Html position={[0, 0.17, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="chip">Pressure gauge · {bar.toFixed(1)} bar</div>
      </Html>
    </group>
  );
}

function Props() {
  const M = mats();
  return (
    <group>
      {/* toolbox */}
      <group position={[-2.1, 0, 0.9]} rotation={[0, 0.35, 0]}>
        <mesh position={[0, 0.14, 0]} castShadow receiveShadow material={M.redPaint}>
          <boxGeometry args={[0.62, 0.28, 0.28]} />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow material={M.darkMetal}>
          <boxGeometry args={[0.5, 0.03, 0.04]} />
        </mesh>
      </group>
      {/* bucket */}
      <mesh position={[2.0, 0.2, 0.7]} castShadow receiveShadow material={M.galv}>
        <cylinderGeometry args={[0.2, 0.15, 0.4, 28, 1, true]} />
      </mesh>
      <mesh position={[2.0, 0.015, 0.7]} material={M.galv}>
        <cylinderGeometry args={[0.15, 0.15, 0.03, 28]} />
      </mesh>
      {/* pipe offcuts */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[2.5 + i * 0.07, 0.04, 0.5 + i * 0.05]} rotation={[0, 0.5 + i * 0.2, Math.PI / 2]} castShadow material={M.copper}>
          <cylinderGeometry args={[0.025, 0.025, 0.5, 20]} />
        </mesh>
      ))}
    </group>
  );
}

// ───────────────────────── drag controller ─────────────────────────
function DropController() {
  const { camera, gl } = useThree();
  const dragPart = useSession((s) => s.drag?.part ?? null);
  useEffect(() => {
    if (!dragPart) return;
    const rc = new THREE.Raycaster();
    const pick = (cx: number, cy: number): string | null => {
      const r = gl.domElement.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
      rc.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      const hit = rc.intersectObjects([...slotHits.values()], false)[0];
      return (hit?.object.userData.slotId as string) ?? null;
    };
    const move = (e: PointerEvent) => {
      useSession.setState({ drag: { part: dragPart, x: e.clientX, y: e.clientY }, hoverSlot: pick(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const id = pick(e.clientX, e.clientY);
      useSession.setState({ drag: null, hoverSlot: null });
      if (id) useSession.getState().act('place', id, { part: dragPart });
    };
    const cancel = () => useSession.setState({ drag: null, hoverSlot: null });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dragPart, camera, gl]);
  return null;
}

// ───────────────────────── scene root ─────────────────────────
export function PlumberScene() {
  const scnId = useSession((s) => s.scenarioId);
  const scn = scenarioById(scnId) as Scenario<PlumberParams>;
  const slots = scn.params.slots;
  const geoms = useMemo(() => layoutRoute(slots), [slots]);
  const b = useMemo(() => boundsOf(geoms), [geoms]);
  const stub = 150;
  const cx = (b.minX - stub + b.maxX) / 2;
  const world = (x: number, y: number): [number, number] => [(x - cx) * K, BASE_Y + y * K];
  const [sx, sy] = world(b.minX - stub, 0);
  const [ex, ey] = world(b.minX, 0);
  const M = mats();
  const widthM = (b.maxX - b.minX + stub) * K;
  const targetY = BASE_Y + ((b.maxY + b.minY) / 2) * K - 0.1;
  const distance = Math.max(3.0, widthM * 1.15 + 1.9);

  // outlet fixture at the end of the last main-line slot
  const last = [...slots].reverse().find((d) => !d.from)!;
  const lg = geoms[last.id];
  const endX = lg.x + Math.cos(lg.ang) * lg.span + (last.kind === 'elbow' ? 0 : 0);
  const endY = lg.y + Math.sin(lg.ang) * lg.span;
  const [ox, oy] = world(endX, endY);
  const fps = useFpsActive();

  return (
    <>
      <Lights />
      <Workshop box={PLUMBER_ROOM} closed={fps} />
      <Props />
      <PlumberStations sx={sx} rigHalf={(widthM + 1.5) / 2} />
      <RecorderBridge />
      {fps ? (
        <PlumberFps tray={scn.params.tray} />
      ) : (
        <>
          <DropController />
          <Controls target={[0, Math.max(0.95, targetY), 0]} minDistance={1.8} maxDistance={Math.max(5.2, distance + 1.5)} />
          <CameraPlacer distance={distance} y={Math.max(1.35, targetY + 0.3)} />
        </>
      )}

      {/* supply stub and riser */}
      <Pipe3 a={[sx, BASE_Y, Z]} b={[ex, ey, Z]} r={0.03} mat={M.copper} />
      <Pipe3 a={[sx, 0, Z]} b={[sx, BASE_Y, Z]} r={0.03} mat={M.copper} />
      <mesh position={[sx, BASE_Y, Z]} castShadow material={M.copper}>
        <sphereGeometry args={[0.03, 20, 14]} />
      </mesh>
      <Stopcock x={sx} />
      <DrainCock x={sx} />
      <Gauge x={sx + (ex - sx) * 0.55} y={BASE_Y + 0.14} />
      <Html position={[sx - 0.2, BASE_Y - 0.12, Z]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">Mains supply · {scn.params.mainsBar} bar</div>
      </Html>
      {/* training rig panel behind the pipework */}
      <mesh position={[0, 0.2 + (BASE_Y + ((b.maxY + 120) * K) - 0.2) / 2, 0.028]} receiveShadow castShadow>
        <boxGeometry args={[widthM + 1.5, BASE_Y + (b.maxY + 120) * K - 0.2, 0.04]} />
        <meshStandardMaterial color="#27323f" roughness={0.55} metalness={0.35} />
      </mesh>

      {slots.map((d) => (
        <Slot key={d.id} def={d} geom={geoms[d.id]} world={world} />
      ))}

      {/* outlet */}
      <group position={[ox, oy, Z]} rotation={[0, 0, lg.ang]}>
        <mesh position={[0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={M.steel}>
          <cylinderGeometry args={[0.035, 0.035, 0.08, 24]} />
        </mesh>
        <mesh position={[0.12, 0, 0]} castShadow material={M.steel}>
          <sphereGeometry args={[0.04, 20, 14]} />
        </mesh>
      </group>
      <Html position={[ox, oy + 0.14, Z]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">{scn.params.outletLabel}</div>
      </Html>
    </>
  );
}

function CameraPlacer({ distance, y }: { distance: number; y: number }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0.0, y, distance);
    camera.lookAt(0, y - 0.35, 0);
  }, [camera, distance, y]);
  return null;
}
