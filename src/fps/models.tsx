import * as THREE from 'three';
import { mats } from '../scenes/common/materials';

// Procedural props for the first-person workshop: gloved hands, hand tools, PPE.
// Convention for tools: origin = where the hand grips, handle along +y, working end at the top.

const matCache = new Map<string, THREE.Material>();
const std = (color: string, roughness = 0.75, metalness = 0, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => {
  const key = `${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness, metalness, envMapIntensity: 1, ...extra });
    matCache.set(key, m);
  }
  return m;
};

export const SKIN = '#c08d6b';
export const GLOVE_COLORS: Record<string, string> = {
  gloves: '#2f5d9e', // plumber work gloves
  gauntlets: '#a8733f', // welder leather gauntlets (PPE id 'gloves' in the welder bay)
  knit: '#9c9a8f',
};

// ───────────────────────── hands ─────────────────────────
/** Where a held item's origin sits in right-hand local space. */
export const GRIP: [number, number, number] = [-0.03, 0, -0.078];

export function Hand({ pose, glove, sleeve, mirror = false }: { pose: 'grip' | 'open'; glove: string; sleeve: string; mirror?: boolean }) {
  const g = std(glove, glove === SKIN ? 0.6 : 0.85);
  const sl = std(sleeve, 0.9);
  const fingersY = [0.028, 0.009, -0.01, -0.028];
  return (
    <group scale={[mirror ? -1 : 1, 1, 1]}>
      <mesh position={[0, -0.004, 0.17]} rotation={[Math.PI / 2, 0, 0]} material={sl}>
        <cylinderGeometry args={[0.046, 0.05, 0.24, 18]} />
      </mesh>
      <mesh position={[0, 0, 0.035]} rotation={[Math.PI / 2, 0, 0]} material={g}>
        <cylinderGeometry args={[0.038, 0.043, 0.06, 18]} />
      </mesh>
      <mesh position={[0, 0, -0.035]} material={g}>
        <boxGeometry args={[0.03, 0.082, 0.09]} />
      </mesh>
      {pose === 'grip' ? (
        <>
          {fingersY.map((y, i) => (
            <group key={i} position={[0, y, 0]}>
              <mesh position={[-0.006, 0, -0.094]} rotation={[Math.PI / 2, 0, 0]} material={g}>
                <capsuleGeometry args={[0.0102, 0.026 - i * 0.002, 4, 10]} />
              </mesh>
              <mesh position={[-0.03, 0, -0.106]} rotation={[0, 0, Math.PI / 2]} material={g}>
                <capsuleGeometry args={[0.0096, 0.026 - i * 0.003, 4, 10]} />
              </mesh>
              <mesh position={[-0.05, 0, -0.092]} rotation={[Math.PI / 2, 0, 0]} material={g}>
                <capsuleGeometry args={[0.0088, 0.012, 4, 8]} />
              </mesh>
            </group>
          ))}
          <mesh position={[-0.03, 0.048, -0.062]} rotation={[0.25, 0, Math.PI / 2 - 0.25]} material={g}>
            <capsuleGeometry args={[0.0108, 0.034, 4, 10]} />
          </mesh>
        </>
      ) : (
        <>
          {fingersY.map((y, i) => (
            <group key={i} position={[-0.004, y * 0.92, -0.08]} rotation={[0, -0.35, 0]}>
              <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={g}>
                <capsuleGeometry args={[0.0098, 0.026 - Math.abs(i - 1.2) * 0.004, 4, 10]} />
              </mesh>
              <mesh position={[-0.014, 0, -0.04]} rotation={[0, 0, Math.PI / 2]} material={g}>
                <capsuleGeometry args={[0.009, 0.014, 4, 8]} />
              </mesh>
            </group>
          ))}
          <mesh position={[-0.024, 0.036, -0.062]} rotation={[-1.2, 0, 0.45]} material={g}>
            <capsuleGeometry args={[0.0105, 0.03, 4, 10]} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ───────────────────────── tools ─────────────────────────
export function ToolModel({ id }: { id: string }) {
  const M = mats();
  switch (id) {
    case 'tape':
      return (
        <group>
          <mesh position={[0, 0.03, 0]} material={std('#f2c230', 0.45)}>
            <boxGeometry args={[0.075, 0.075, 0.034]} />
          </mesh>
          <mesh position={[0, 0.03, 0.018]} rotation={[Math.PI / 2, 0, 0]} material={M.darkMetal}>
            <cylinderGeometry args={[0.024, 0.024, 0.004, 24]} />
          </mesh>
          <mesh position={[0.042, -0.002, 0]} material={M.steel}>
            <boxGeometry args={[0.02, 0.006, 0.02]} />
          </mesh>
        </group>
      );
    case 'wrench':
      return (
        <group>
          <mesh position={[0, 0.03, 0]} material={M.steel}>
            <boxGeometry args={[0.018, 0.2, 0.008]} />
          </mesh>
          <mesh position={[0, 0.14, 0]} material={M.steel}>
            <boxGeometry args={[0.055, 0.036, 0.012]} />
          </mesh>
          <mesh position={[0.012, 0.165, 0]} material={M.steel}>
            <boxGeometry args={[0.02, 0.03, 0.012]} />
          </mesh>
          <mesh position={[-0.017, 0.163, 0]} material={M.steel}>
            <boxGeometry args={[0.014, 0.026, 0.012]} />
          </mesh>
        </group>
      );
    case 'hammer':
      return (
        <group>
          <mesh position={[0, 0.05, 0]} material={std('#9c6a3c', 0.6)}>
            <cylinderGeometry args={[0.011, 0.013, 0.27, 12]} />
          </mesh>
          <mesh position={[0, 0.19, 0]} rotation={[0, 0, Math.PI / 2]} material={M.darkMetal}>
            <cylinderGeometry args={[0.016, 0.016, 0.07, 14]} />
          </mesh>
          <mesh position={[-0.05, 0.195, 0]} rotation={[0, 0, -0.5]} material={M.darkMetal}>
            <boxGeometry args={[0.05, 0.016, 0.018]} />
          </mesh>
        </group>
      );
    case 'pliers':
      return (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.01, 0.02, 0]} rotation={[0, 0, s * 0.08]} material={M.redPaint}>
              <boxGeometry args={[0.012, 0.13, 0.01]} />
            </mesh>
          ))}
          <mesh position={[0, 0.1, 0]} material={M.steel}>
            <cylinderGeometry args={[0.012, 0.012, 0.014, 14]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.006, 0.135, 0]} rotation={[0, 0, -s * 0.12]} material={M.steel}>
              <boxGeometry args={[0.012, 0.06, 0.012]} />
            </mesh>
          ))}
        </group>
      );
    case 'marker':
      return (
        <group>
          <mesh position={[0, 0.04, 0]} material={std('#e8e2d0', 0.5)}>
            <cylinderGeometry args={[0.01, 0.01, 0.12, 14]} />
          </mesh>
          <mesh position={[0, 0.11, 0]} material={std('#d4222c', 0.4)}>
            <cylinderGeometry args={[0.011, 0.011, 0.03, 14]} />
          </mesh>
        </group>
      );
    case 'brush':
      return (
        <group>
          <mesh position={[0, 0.04, 0]} material={std('#a5713f', 0.6)}>
            <boxGeometry args={[0.022, 0.2, 0.014]} />
          </mesh>
          <mesh position={[0, 0.11, 0.013]} material={M.steel}>
            <boxGeometry args={[0.026, 0.07, 0.014]} />
          </mesh>
        </group>
      );
    case 'gapgauge':
      return (
        <group>
          <mesh position={[0, 0.02, 0]} material={M.darkMetal}>
            <boxGeometry args={[0.022, 0.07, 0.012]} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0.004 * i, 0.085, 0]} rotation={[0, 0, -0.12 * i]} material={M.steel}>
              <boxGeometry args={[0.014, 0.08, 0.0015]} />
            </mesh>
          ))}
        </group>
      );
    case 'clamp':
      return (
        <group>
          <mesh position={[0, 0.02, 0]} material={M.redPaint}>
            <boxGeometry args={[0.02, 0.1, 0.014]} />
          </mesh>
          <mesh position={[0.025, 0.075, 0]} material={M.redPaint}>
            <boxGeometry args={[0.07, 0.016, 0.014]} />
          </mesh>
          <mesh position={[0.055, 0.04, 0]} material={M.redPaint}>
            <boxGeometry args={[0.014, 0.08, 0.014]} />
          </mesh>
          <mesh position={[0.012, 0.005, 0]} material={M.steel}>
            <cylinderGeometry args={[0.005, 0.005, 0.06, 10]} />
          </mesh>
        </group>
      );
    case 'gauge':
      return (
        <group>
          <mesh position={[0, 0.05, 0]} material={M.steel}>
            <boxGeometry args={[0.05, 0.11, 0.003]} />
          </mesh>
          <mesh position={[0.012, 0.1, 0.002]} material={M.darkMetal}>
            <boxGeometry args={[0.018, 0.018, 0.003]} />
          </mesh>
        </group>
      );
    case 'magnifier':
      return (
        <group>
          <mesh position={[0, 0.02, 0]} material={M.blackRubber}>
            <cylinderGeometry args={[0.011, 0.012, 0.1, 14]} />
          </mesh>
          <mesh position={[0, 0.115, 0]} material={M.darkMetal}>
            <torusGeometry args={[0.04, 0.006, 10, 30]} />
          </mesh>
          <mesh position={[0, 0.115, 0]} material={std('#cfe8ff', 0.05, 0, { transmission: 0.9, transparent: true, opacity: 0.35 })}>
            <circleGeometry args={[0.04, 30]} />
          </mesh>
        </group>
      );
    case 'torch':
      return (
        <group>
          <mesh position={[0, 0, 0]} material={M.blackRubber}>
            <boxGeometry args={[0.036, 0.13, 0.04]} />
          </mesh>
          <mesh position={[-0.02, 0.01, 0]} material={M.redPaint}>
            <boxGeometry args={[0.01, 0.04, 0.014]} />
          </mesh>
          <mesh position={[0, 0.1, 0.012]} rotation={[0.5, 0, 0]} material={M.darkMetal}>
            <cylinderGeometry args={[0.013, 0.016, 0.1, 16]} />
          </mesh>
          <mesh position={[0, 0.155, 0.045]} rotation={[0.9, 0, 0]} material={M.brass}>
            <cylinderGeometry args={[0.012, 0.018, 0.05, 16]} />
          </mesh>
          <mesh position={[0, -0.09, 0]} material={M.blackRubber}>
            <cylinderGeometry args={[0.012, 0.012, 0.06, 10]} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

// ───────────────────────── PPE ─────────────────────────
function Glasses({ lens }: { lens: string }) {
  const frame = std('#22262c', 0.5);
  const glass = std(lens, 0.08, 0, { transparent: true, opacity: 0.55 });
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.034, 0, 0]} material={glass}>
          <boxGeometry args={[0.058, 0.032, 0.004]} />
        </mesh>
      ))}
      <mesh position={[0, 0.018, 0]} material={frame}>
        <boxGeometry args={[0.13, 0.006, 0.008]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.064, 0.012, -0.05]} material={frame}>
          <boxGeometry args={[0.005, 0.005, 0.1]} />
        </mesh>
      ))}
    </group>
  );
}

function GlovePair({ color, long = false }: { color: string; long?: boolean }) {
  const m = std(color, 0.85);
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.055, 0, 0]} rotation={[-Math.PI / 2, 0, s * 0.15]}>
          <mesh material={m}>
            <boxGeometry args={[0.075, long ? 0.2 : 0.13, 0.022]} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[-0.027 + i * 0.018, (long ? 0.1 : 0.065) + 0.02, 0]} material={m}>
              <capsuleGeometry args={[0.008, 0.03, 4, 8]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function PpeModel({ id, trade }: { id: string; trade: 'plumber' | 'welder' }) {
  switch (id) {
    case 'glasses':
      return <Glasses lens="#bfe3ff" />;
    case 'sunglasses':
      return <Glasses lens="#101418" />;
    case 'gloves':
      return trade === 'plumber' ? <GlovePair color={GLOVE_COLORS.gloves} /> : <GlovePair color={GLOVE_COLORS.gauntlets} long />;
    case 'knit':
      return <GlovePair color={GLOVE_COLORS.knit} />;
    case 'sandals':
      return (
        <group>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.06, 0, 0]}>
              <mesh material={std('#8a5a32', 0.8)}>
                <boxGeometry args={[0.08, 0.016, 0.24]} />
              </mesh>
              <mesh position={[0, 0.02, -0.03]} material={std('#3a2a1c', 0.8)}>
                <boxGeometry args={[0.082, 0.012, 0.03]} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case 'helmet':
      return (
        <group>
          <mesh scale={[1, 1.15, 1.05]} material={std('#2a2d33', 0.45, 0.1, { clearcoat: 0.6 })}>
            <sphereGeometry args={[0.12, 24, 16, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
          </mesh>
          <mesh position={[0, -0.01, 0.112]} material={std('#0b2a1a', 0.1, 0.3, { clearcoat: 1 })}>
            <boxGeometry args={[0.1, 0.05, 0.012]} />
          </mesh>
        </group>
      );
    case 'jacket':
      return (
        <group>
          <mesh material={std('#24364f', 0.9)}>
            <boxGeometry args={[0.36, 0.42, 0.06]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.2, 0.02, 0]} rotation={[0, 0, s * 0.18]} material={std('#24364f', 0.9)}>
              <boxGeometry args={[0.08, 0.38, 0.055]} />
            </mesh>
          ))}
          <mesh position={[0, 0.25, 0]} rotation={[0, 0, 0]} material={mats().steel}>
            <torusGeometry args={[0.03, 0.004, 8, 20, Math.PI]} />
          </mesh>
        </group>
      );
    case 'boots':
      return (
        <group>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.07, 0, 0]}>
              <mesh position={[0, 0.02, 0.02]} material={std('#15171a', 0.7)}>
                <boxGeometry args={[0.09, 0.04, 0.27]} />
              </mesh>
              <mesh position={[0, 0.1, -0.05]} material={std('#2c2118', 0.8)}>
                <boxGeometry args={[0.085, 0.16, 0.11]} />
              </mesh>
            </group>
          ))}
        </group>
      );
    default:
      return null;
  }
}
