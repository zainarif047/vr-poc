import { Label as Html } from '../common/Label';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { scenarioById } from '../../engine';
import type { Scenario } from '../../engine/types';
import { DEFECT_LABEL, FLAMMABLE_LABEL, SEAM_MM, SEGMENTS, type DefectType, type WelderParams, type WelderState } from '../../engine/welder/reducer';
import { useSession } from '../../store/session';
import { mats } from '../common/materials';
import { Controls, Lights, RecorderBridge, Room } from '../common/Rig';

const K = 0.004; // metres per scene-mm
const TABLE_Y = 0.9;
const SEG_W = (SEAM_MM / SEGMENTS) * K;
const REST: [number, number, number] = [0.62, TABLE_Y + 0.1, 0.1];
export const TIME_SCALE = 2; // simulation time runs ×2 – a 120 mm seam at WPS speed takes ~10–15 s of real dragging
const segX = (i: number) => -((SEAM_MM * K) / 2) + (i + 0.5) * SEG_W;
const rng = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ───────────────────────── geometry of the coupon ─────────────────────────
function useCoupon(p: WelderParams) {
  const t = p.thickness * K;
  const topY = TABLE_Y + t;
  const seamZ = p.joint === 'butt' ? 0 : (p.thickness / 2) * K;
  const seamY = p.joint === 'butt' ? topY : TABLE_Y + t; // fillet seam sits in the corner at base-plate top
  return { t, topY, seamZ, seamY };
}

// ───────────────────────── one bead segment ─────────────────────────
function BeadSeg({ i, defect, y, z, heatRef }: { i: number; defect: DefectType; y: number; z: number; heatRef: React.MutableRefObject<number[]> }) {
  const M = mats();
  const mat = useMemo(() => M.bead.clone(), [M]);
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const h = heatRef.current[i] ?? 0;
    if (h > 0) heatRef.current[i] = Math.max(0, h - dt * 0.22);
    mat.emissive.setRGB(1, 0.32, 0.04);
    mat.emissiveIntensity = h * 2.4;
    if (ref.current) ref.current.visible = true;
  });
  const x = segX(i);
  const wob = 1 + Math.sin(i * 1.7) * 0.06;
  const burn = defect === 'burnThrough';
  const lof = defect === 'lackFusion';
  return (
    <group ref={ref} position={[x, y, z]}>
      <mesh
        rotation={[0, 0, Math.PI / 2]}
        scale={[burn ? 0.7 : 1, 1, lof ? 0.7 : wob]}
        position={[0, lof ? 0.002 : burn ? -0.003 : 0, lof ? 0.008 : 0]}
        castShadow
        receiveShadow
        material={mat}
      >
        <capsuleGeometry args={[burn ? 0.007 : 0.0105, SEG_W * 0.9, 6, 14]} />
      </mesh>
      {defect === 'porosity' &&
        [0, 1, 2].map((k) => (
          <mesh key={k} position={[(rng(i, k) - 0.5) * SEG_W * 0.8, 0.0085, (rng(i, k + 5) - 0.5) * 0.012]}>
            <sphereGeometry args={[0.0032, 8, 6]} />
            <meshBasicMaterial color="#050505" />
          </mesh>
        ))}
      {defect === 'undercut' &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[0, -0.002, s * 0.0135]}>
            <boxGeometry args={[SEG_W * 0.98, 0.004, 0.0035]} />
            <meshBasicMaterial color="#050505" />
          </mesh>
        ))}
      {lof && (
        <mesh position={[0, 0.0005, -0.009]}>
          <boxGeometry args={[SEG_W * 0.98, 0.003, 0.0045]} />
          <meshBasicMaterial color="#050505" />
        </mesh>
      )}
      {burn && (
        <mesh position={[0, 0.003, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.0105, 0.0105, 0.004, 18]} />
          <meshBasicMaterial color="#020202" />
        </mesh>
      )}
      {defect === 'spatter' &&
        [0, 1, 2, 3, 4].map((k) => (
          <mesh key={k} position={[(rng(i, k + 9) - 0.5) * SEG_W, 0.0035, (rng(i, k + 2) > 0.5 ? 1 : -1) * (0.016 + rng(i, k) * 0.016)]}>
            <sphereGeometry args={[0.0028, 8, 6]} />
            <meshStandardMaterial color="#b8bfc9" metalness={1} roughness={0.25} />
          </mesh>
        ))}
    </group>
  );
}

// ───────────────────────── torch + arc ─────────────────────────
function Torch({ target, arcOn, angle, params }: { target: React.MutableRefObject<THREE.Vector3>; arcOn: boolean; angle: number; params: WelderParams }) {
  const g = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const glow = useRef<THREE.Mesh>(null);
  const spark = useRef<THREE.Points>(null);
  const M = mats();
  const sp = useMemo(() => {
    const N = 40;
    return { N, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N) };
  }, []);
  useFrame((st, dt) => {
    if (!g.current) return;
    g.current.position.lerp(target.current, Math.min(1, dt * 14));
    g.current.rotation.z += (THREE.MathUtils.degToRad(angle) - g.current.rotation.z) * Math.min(1, dt * 8);
    const flick = arcOn ? 0.75 + Math.random() * 0.5 : 0;
    if (light.current) light.current.intensity = arcOn ? 5.5 * flick : 0;
    if (glow.current) {
      glow.current.visible = arcOn;
      glow.current.scale.setScalar(0.7 + Math.random() * 0.5);
    }
    if (spark.current) {
      spark.current.visible = arcOn;
      if (arcOn) {
        for (let i = 0; i < sp.N; i++) {
          sp.life[i] -= dt * 1.6;
          if (sp.life[i] <= 0) {
            sp.life[i] = 0.5 + Math.random() * 0.6;
            sp.pos[i * 3] = 0;
            sp.pos[i * 3 + 1] = 0;
            sp.pos[i * 3 + 2] = 0;
            const a = Math.random() * Math.PI * 2;
            const s = 0.15 + Math.random() * 0.35;
            sp.vel[i * 3] = Math.cos(a) * s;
            sp.vel[i * 3 + 1] = 0.2 + Math.random() * 0.45;
            sp.vel[i * 3 + 2] = Math.sin(a) * s;
          } else {
            sp.vel[i * 3 + 1] -= 1.6 * dt;
            sp.pos[i * 3] += sp.vel[i * 3] * dt;
            sp.pos[i * 3 + 1] += sp.vel[i * 3 + 1] * dt;
            sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt;
          }
        }
        (spark.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    }
    void st;
    void params;
  });
  return (
    <group ref={g} position={REST} scale={0.85}>
      <group>
        {/* nozzle */}
        <mesh position={[0, 0.03, 0]} castShadow material={M.brass}>
          <cylinderGeometry args={[0.013, 0.02, 0.06, 20]} />
        </mesh>
        <mesh position={[0, 0.012, 0]} material={M.steel}>
          <cylinderGeometry args={[0.004, 0.005, 0.03, 12]} />
        </mesh>
        {/* neck */}
        <mesh position={[-0.02, 0.1, 0]} rotation={[0, 0, 0.35]} castShadow material={M.darkMetal}>
          <cylinderGeometry args={[0.014, 0.017, 0.12, 18]} />
        </mesh>
        {/* handle */}
        <mesh position={[-0.075, 0.2, 0]} rotation={[0, 0, 0.35]} castShadow material={M.blackRubber}>
          <boxGeometry args={[0.04, 0.16, 0.05]} />
        </mesh>
        <mesh position={[-0.055, 0.18, 0.027]} rotation={[0, 0, 0.35]} material={M.redPaint}>
          <boxGeometry args={[0.016, 0.04, 0.008]} />
        </mesh>
      </group>
      <pointLight ref={light} position={[0, 0.02, 0]} color="#bcd8ff" distance={1.6} decay={1.6} castShadow={false} intensity={0} />
      <mesh ref={glow} position={[0, -0.002, 0]} visible={false}>
        <sphereGeometry args={[0.012, 12, 10]} />
        <meshBasicMaterial color="#dff0ff" toneMapped={false} />
      </mesh>
      <points ref={spark} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sp.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ffb24a" size={0.008} toneMapped={false} transparent opacity={0.95} depthWrite={false} />
      </points>
    </group>
  );
}

// ───────────────────────── workshop furniture ─────────────────────────
function Table() {
  const M = mats();
  return (
    <group>
      <mesh position={[0, TABLE_Y - 0.04, 0]} castShadow receiveShadow material={M.table}>
        <boxGeometry args={[2.3, 0.08, 1.0]} />
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 1.05, TABLE_Y / 2 - 0.04, sz * 0.43]} castShadow material={M.darkMetal}>
            <boxGeometry args={[0.07, TABLE_Y - 0.08, 0.07]} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.25, 0]} castShadow material={M.darkMetal}>
        <boxGeometry args={[2.1, 0.04, 0.8]} />
      </mesh>
    </group>
  );
}

function Machine({ preset, wire, gas }: { preset: string | null; wire: string | null; gas: string | null }) {
  const M = mats();
  return (
    <group position={[1.65, 0, -0.1]}>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow material={M.machine}>
        <boxGeometry args={[0.52, 0.64, 0.5]} />
      </mesh>
      <mesh position={[0, 0.12, 0]} castShadow material={M.darkMetal}>
        <boxGeometry args={[0.56, 0.1, 0.54]} />
      </mesh>
      {[-0.19, 0.19].map((x) => (
        <mesh key={x} position={[x, 0.07, 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow material={M.blackRubber}>
          <cylinderGeometry args={[0.07, 0.07, 0.05, 20]} />
        </mesh>
      ))}
      <mesh position={[-0.12, 0.58, 0.255]} material={M.blackRubber}>
        <boxGeometry args={[0.2, 0.1, 0.01]} />
      </mesh>
      {[0.08, 0.17].map((x) => (
        <mesh key={x} position={[x, 0.58, 0.27]} rotation={[Math.PI / 2, 0, 0]} material={M.steel}>
          <cylinderGeometry args={[0.028, 0.028, 0.03, 18]} />
        </mesh>
      ))}
      <Html position={[0, 0.98, 0.1]} center style={{ pointerEvents: 'none' }}>
        <div className="chip">
          MIG machine · {preset ? preset.slice(1) + ' A' : 'preset —'} · {wire ? wire.toUpperCase() : 'wire —'} · {gas ?? 'gas —'}
        </div>
      </Html>
    </group>
  );
}

function GasCylinder() {
  const M = mats();
  return (
    <group position={[-1.7, 0, -0.35]}>
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.11, 0.11, 1.24, 32]} />
        <meshPhysicalMaterial color="#1f7a3a" metalness={0.4} roughness={0.35} clearcoat={0.6} />
      </mesh>
      <mesh position={[0, 1.27, 0]} castShadow>
        <sphereGeometry args={[0.11, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#1f7a3a" metalness={0.4} roughness={0.35} clearcoat={0.6} />
      </mesh>
      <mesh position={[0, 1.36, 0]} castShadow material={M.brass}>
        <cylinderGeometry args={[0.035, 0.045, 0.1, 16]} />
      </mesh>
      <mesh position={[0.07, 1.4, 0]} castShadow material={M.steel}>
        <boxGeometry args={[0.1, 0.08, 0.07]} />
      </mesh>
      <Html position={[0, 1.55, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">Shielding gas cylinder</div>
      </Html>
    </group>
  );
}

function Extinguisher() {
  const M = mats();
  const checked = useSession((s) => (s.state as WelderState).extinguisher);
  const click = (e: any) => {
    e.stopPropagation();
    const s = useSession.getState();
    if (s.phase === 'active') s.act('extinguisher');
  };
  return (
    <group position={[2.55, 0, 0.2]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow material={M.redPaint} onClick={click} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <cylinderGeometry args={[0.085, 0.085, 0.6, 28]} />
      </mesh>
      <mesh position={[0, 0.63, 0]} material={M.darkMetal}>
        <cylinderGeometry args={[0.03, 0.04, 0.08, 14]} />
      </mesh>
      <mesh position={[0.06, 0.66, 0]} material={M.blackRubber}>
        <boxGeometry args={[0.13, 0.02, 0.03]} />
      </mesh>
      <mesh position={[0, 0.5, 0.088]} material={checked ? M.nutTight : M.nutLoose}>
        <boxGeometry args={[0.05, 0.05, 0.01]} />
      </mesh>
      <Html position={[0, 0.85, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`chip ${checked ? 'chip-ok' : ''}`}>Fire extinguisher{checked ? ' · checked' : ' · click to check'}</div>
      </Html>
    </group>
  );
}

function FumeExtractor() {
  const M = mats();
  const on = useSession((s) => (s.state as WelderState).vent);
  const fan = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (fan.current && on) fan.current.rotation.z += dt * 18;
  });
  const click = (e: any) => {
    e.stopPropagation();
    const s = useSession.getState();
    if (s.phase === 'active') s.act('vent', undefined, { on: !on });
  };
  const hover = {
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = ''),
  };
  return (
    <group position={[0.7, TABLE_Y, -0.35]}>
      <mesh position={[0, 0.03, 0]} castShadow material={M.darkMetal}>
        <cylinderGeometry args={[0.1, 0.12, 0.06, 24]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow material={M.steel}>
        <cylinderGeometry args={[0.028, 0.028, 0.5, 14]} />
      </mesh>
      <mesh position={[-0.12, 0.55, 0.05]} rotation={[0, 0, Math.PI / 2.6]} castShadow material={M.steel}>
        <cylinderGeometry args={[0.025, 0.025, 0.34, 14]} />
      </mesh>
      <group position={[-0.28, 0.55, 0.1]} rotation={[0.2, 0, 0]}>
        <mesh castShadow material={M.darkMetal} onClick={click} {...hover}>
          <cylinderGeometry args={[0.16, 0.1, 0.1, 28, 1, true]} />
        </mesh>
        <mesh ref={fan} position={[0, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]} onClick={click} {...hover}>
          <boxGeometry args={[0.22, 0.016, 0.012]} />
          <meshStandardMaterial color={on ? '#7cf0c6' : '#555a62'} metalness={0.7} roughness={0.4} />
        </mesh>
      </group>
      <Html position={[-0.28, 0.82, 0.1]} center style={{ pointerEvents: 'none' }}>
        <div className={`chip ${on ? 'chip-ok' : ''}`}>Fume extraction · {on ? 'ON' : 'OFF – click'}</div>
      </Html>
    </group>
  );
}

function Flammable({ id, home }: { id: string; home: [number, number, number] }) {
  const cleared = useSession((s) => (s.state as WelderState).cleared.includes(id));
  const g = useRef<THREE.Group>(null);
  const away: [number, number, number] = id === 'rags' ? [-2.45, 0.05, 0.9] : id === 'solvent' ? [-2.2, 0.12, 1.15] : [-2.7, 0.18, 0.7];
  useFrame((_, dt) => {
    if (!g.current) return;
    const tgt = cleared ? away : home;
    g.current.position.x += (tgt[0] - g.current.position.x) * Math.min(1, dt * 4);
    g.current.position.y += (tgt[1] - g.current.position.y) * Math.min(1, dt * 4);
    g.current.position.z += (tgt[2] - g.current.position.z) * Math.min(1, dt * 4);
  });
  const click = (e: any) => {
    e.stopPropagation();
    const s = useSession.getState();
    if (s.phase === 'active' && !cleared) s.act('clear', id);
  };
  const hover = {
    onPointerOver: () => !cleared && (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = ''),
  };
  return (
    <group ref={g} position={home}>
      {id === 'rags' && (
        <mesh castShadow receiveShadow onClick={click} {...hover}>
          <dodecahedronGeometry args={[0.07, 0]} />
          <meshStandardMaterial color="#4b3a2a" roughness={0.95} />
        </mesh>
      )}
      {id === 'solvent' && (
        <group onClick={click} {...hover}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.11, 0.18, 0.08]} />
            <meshStandardMaterial color="#d9a21b" roughness={0.45} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.041]}>
            <planeGeometry args={[0.07, 0.1]} />
            <meshBasicMaterial color="#c0221b" />
          </mesh>
        </group>
      )}
      {id === 'cardboard' && (
        <group onClick={click} {...hover}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.28, 0.2, 0.22]} />
            <meshStandardMaterial color="#a67c4d" roughness={0.9} />
          </mesh>
          <mesh position={[0.02, 0.2, 0]} castShadow rotation={[0, 0.3, 0]}>
            <boxGeometry args={[0.2, 0.14, 0.18]} />
            <meshStandardMaterial color="#b58a58" roughness={0.9} />
          </mesh>
        </group>
      )}
      {!cleared && (
        <Html position={[0, 0.22, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="chip chip-warn">🔥 {FLAMMABLE_LABEL[id]} · click to clear</div>
        </Html>
      )}
    </group>
  );
}

// ───────────────────────── seam interaction ─────────────────────────
function SeamControl({ scn, target, y, z }: { scn: Scenario<WelderParams>; target: React.MutableRefObject<THREE.Vector3>; y: number; z: number }) {
  const mode = scn.params.mode;
  const drag = useRef<{ x: number; t: number; samples: { t: number; x: number }[] } | null>(null);
  const lastHud = useRef(0);
  const toX = (wx: number) => THREE.MathUtils.clamp(wx, -(SEAM_MM * K) / 2, (SEAM_MM * K) / 2);
  const segOf = (wx: number) => Math.min(SEGMENTS - 1, Math.max(0, Math.floor(((wx + (SEAM_MM * K) / 2) / (SEAM_MM * K)) * SEGMENTS)));

  useEffect(() => {
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      const s = useSession.getState();
      if (s.phase === 'active' && (s.state as WelderState).arcOn) s.act('arc_stop');
      useSession.setState({ liveSpeed: 0 });
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <mesh
      position={[0, y + 0.012, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={mats().invisible}
      onPointerOver={() => (document.body.style.cursor = mode === 'full' ? 'crosshair' : 'pointer')}
      onPointerOut={() => {
        document.body.style.cursor = '';
        if (!drag.current) target.current.set(REST[0], REST[1], REST[2]);
      }}
      onPointerDown={(e) => {
        const s = useSession.getState();
        if (s.phase !== 'active' || mode !== 'full') return;
        const st = s.state as WelderState;
        if (st.weldDone && st.inspectTool) return; // inspection clicks are handled by onClick
        e.stopPropagation();
        const idx = segOf(e.point.x);
        if (st.next > 0 && idx > st.next + 2) {
          s.toastMsg('Resume from the end of the last bead.', 'warn');
          return;
        }
        if (!s.act('arc_start')) return;
        const x = toX(e.point.x);
        const t0 = e.nativeEvent.timeStamp;
        drag.current = { x, t: t0, samples: [{ t: t0, x }] };
        target.current.set(x, y + 0.02, z);
      }}
      onPointerMove={(e) => {
        const x = toX(e.point.x);
        const s = useSession.getState();
        if (!drag.current) {
          if (s.phase === 'active') target.current.set(x, y + (mode === 'full' ? 0.07 : 0.09), z + (mode === 'full' ? 0 : 0.0));
          return;
        }
        if (s.phase !== 'active') return;
        const now = e.nativeEvent.timeStamp; // event time, not handler time – robust to render stalls
        const d = drag.current;
        d.samples.push({ t: now, x });
        while (d.samples.length > 2 && now - d.samples[0].t > 260) d.samples.shift();
        const a = d.samples[0];
        const dtS = Math.max(0.05, (now - a.t) / 1000);
        const speed = Math.abs(x - a.x) / K / dtS / TIME_SCALE;
        target.current.set(x, y + 0.02, z);
        if (now - lastHud.current > 90) {
          lastHud.current = now;
          useSession.setState({ liveSpeed: speed });
        }
        const st = s.state as WelderState;
        let next = st.next;
        const idx = segOf(x);
        while (next <= idx && next < SEGMENTS) {
          s.act('bead', undefined, { i: next, speed: Number(Math.max(0.5, speed).toFixed(2)) });
          next += 1;
        }
      }}
      onClick={(e) => {
        const s = useSession.getState();
        if (s.phase !== 'active') return;
        const w = s.state as WelderState;
        if (!w.weldDone) return;
        e.stopPropagation();
        s.act('flag', undefined, { seg: segOf(e.point.x), type: s.defectType });
      }}
    >
      <planeGeometry args={[SEAM_MM * K + 0.1, 0.22]} />
    </mesh>
  );
}

// ───────────────────────── scene root ─────────────────────────
export function WelderScene() {
  const scnId = useSession((s) => s.scenarioId);
  const scn = scenarioById(scnId) as Scenario<WelderParams>;
  const p = scn.params;
  const st = useSession((s) => s.state as WelderState);
  const phase = useSession((s) => s.phase);
  const M = mats();
  const { t, topY, seamZ, seamY } = useCoupon(p);
  const heat = useRef<number[]>(Array(SEGMENTS).fill(0));
  const target = useRef(new THREE.Vector3(REST[0], REST[1], REST[2]));
  const prevNext = useRef(st.next);
  const prevTacks = useRef(st.tacks.length);
  const tackHeat = useRef<Record<string, number>>({});

  // heat glow for new beads / tacks (works for live play and replays alike)
  useEffect(() => {
    if (st.next > prevNext.current) for (let i = prevNext.current; i < st.next; i++) heat.current[i] = 1;
    prevNext.current = st.next;
  }, [st.next]);
  useEffect(() => {
    if (st.tacks.length > prevTacks.current) {
      const n = st.tacks[st.tacks.length - 1];
      tackHeat.current[n] = 1;
    }
    prevTacks.current = st.tacks.length;
  }, [st.tacks]);

  // replay (or any non-interactive arc) drives the torch from state
  useFrame(() => {
    if (phase === 'replaying' && st.arcOn) target.current.set(segX(Math.min(SEGMENTS - 1, Math.max(0, st.next - 1))), seamY + 0.03, seamZ);
  });

  const gapM = p.fitGap * K;
  const flagList = st.flags;
  const seamPos = p.joint === 'butt' ? seamZ : seamZ + 0.012;

  return (
    <>
      <Lights />
      <Room wallZ={-1.5} plain />
      <RecorderBridge />
      <Controls target={[0, TABLE_Y, 0]} minDistance={0.8} maxDistance={3.6} />
      <CameraPlacer />
      <Table />
      <GasCylinder />
      <Machine preset={st.preset} wire={st.wire} gas={st.gas} />
      <Extinguisher />
      <FumeExtractor />
      {p.flammables.includes('rags') && <Flammable id="rags" home={[0.55, TABLE_Y + 0.07, 0.36]} />}
      {p.flammables.includes('solvent') && <Flammable id="solvent" home={[-0.62, TABLE_Y + 0.09, 0.33]} />}
      {p.flammables.includes('cardboard') && <Flammable id="cardboard" home={[-0.7, TABLE_Y + 0.1, 0.3]} />}

      {/* coupon */}
      {p.joint === 'butt' ? (
        <group>
          <mesh position={[0, TABLE_Y + t / 2, gapM / 2 + 0.12]} castShadow receiveShadow material={M.plate}>
            <boxGeometry args={[SEAM_MM * K, t, 0.24]} />
          </mesh>
          <mesh position={[0, TABLE_Y + t / 2, -gapM / 2 - 0.12]} castShadow receiveShadow material={M.plate}>
            <boxGeometry args={[SEAM_MM * K, t, 0.24]} />
          </mesh>
          {st.cleaned &&
            [-1, 1].map((s) => (
              <mesh key={s} position={[0, topY + 0.0006, s * (gapM / 2 + 0.05)]} receiveShadow material={M.plateClean} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[SEAM_MM * K, 0.1]} />
              </mesh>
            ))}
        </group>
      ) : (
        <group>
          <mesh position={[0, TABLE_Y + t / 2, 0.02]} castShadow receiveShadow material={M.plate}>
            <boxGeometry args={[SEAM_MM * K, t, 0.34]} />
          </mesh>
          <mesh position={[0, TABLE_Y + t + 0.11, -0.02 * 0]} castShadow receiveShadow material={M.plate}>
            <boxGeometry args={[SEAM_MM * K, 0.22, t]} />
          </mesh>
          {st.cleaned && (
            <mesh position={[0, TABLE_Y + t + 0.0006, 0.07]} receiveShadow material={M.plateClean} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[SEAM_MM * K, 0.09]} />
            </mesh>
          )}
        </group>
      )}
      {/* gap shadow strip (butt) */}
      {p.joint === 'butt' && (
        <mesh position={[0, TABLE_Y + 0.0006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[SEAM_MM * K, Math.max(gapM, 0.003)]} />
          <meshBasicMaterial color="#090a0c" />
        </mesh>
      )}
      {/* clamps */}
      {st.clamped &&
        [-1, 1].map((s) => (
          <group key={s} position={[s * (SEAM_MM * K * 0.5 + 0.018), TABLE_Y + 0.012, p.joint === 'butt' ? 0 : 0.02]}>
            <mesh castShadow material={M.steel}>
              <boxGeometry args={[0.014, 0.016, 0.26]} />
            </mesh>
            <mesh position={[0, 0.014, 0.1 * s]} castShadow material={M.redPaint}>
              <boxGeometry args={[0.014, 0.02, 0.03]} />
            </mesh>
          </group>
        ))}
      {/* tacks */}
      {st.tacks.map((tk) => {
        const x = tk === 's' ? segX(0) : tk === 'e' ? segX(SEGMENTS - 1) : 0;
        return <TackBlob key={tk} x={x} y={seamY + 0.006} z={seamZ} id={tk} heat={tackHeat} />;
      })}
      {/* beads */}
      {st.segs.map((sg, i) =>
        sg ? <BeadSeg key={i} i={i} defect={sg.defect} y={seamY + 0.008} z={seamPos} heatRef={heat} /> : null,
      )}
      {/* inspection flags */}
      {flagList.map((f) => (
        <group key={f.seg} position={[segX(f.seg), seamY + 0.07, seamPos]}>
          <mesh rotation={[Math.PI, 0, 0]} position={[0, 0, 0]}>
            <coneGeometry args={[0.012, 0.04, 12]} />
            <meshBasicMaterial color="#ffb703" />
          </mesh>
          <Html position={[0, 0.045, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="chip chip-flag">{DEFECT_LABEL[f.type as DefectType] ?? f.type} · #{f.seg + 1}</div>
          </Html>
        </group>
      ))}
      <Torch target={target} arcOn={st.arcOn} angle={st.angle} params={p} />
      <SeamControl scn={scn} target={target} y={seamY} z={seamZ} />
      <Html position={[-(SEAM_MM * K) / 2 - 0.02, TABLE_Y + 0.17, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">
          {p.joint === 'butt' ? 'Butt joint' : 'Fillet joint'} · {p.thickness} mm
        </div>
      </Html>
      <Html position={[0, TABLE_Y + 0.13, 0.3]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">
          {p.mode === 'full' ? 'Hold & drag along the seam to weld →' : 'Select a tool, then click the weld to mark defects'}
        </div>
      </Html>
    </>
  );
}

function TackBlob({ x, y, z, id, heat }: { x: number; y: number; z: number; id: string; heat: React.MutableRefObject<Record<string, number>> }) {
  const mat = useMemo(() => mats().bead.clone(), []);
  useFrame((_, dt) => {
    const h = heat.current[id] ?? 0;
    if (h > 0) heat.current[id] = Math.max(0, h - dt * 0.4);
    mat.emissive.setRGB(1, 0.3, 0.05);
    mat.emissiveIntensity = h * 2.4;
  });
  return (
    <mesh position={[x, y, z]} castShadow material={mat}>
      <sphereGeometry args={[0.012, 12, 10]} />
    </mesh>
  );
}

function CameraPlacer() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0.05, TABLE_Y + 0.62, 1.12);
    camera.lookAt(0, TABLE_Y + 0.0, 0);
  }, [camera]);
  return null;
}
