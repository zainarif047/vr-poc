import * as THREE from 'three';
import type { Material, PartKind } from '../../engine/plumber/catalog';
import { CAP_LEN, ELBOW_R, TEE_LEN, VALVE_LEN } from '../../engine/plumber/layout';
import { mats } from '../common/materials';

export const K = 0.0028; // metres per scene-mm (scene is deliberately enlarged for readability on screen)

/** Length of a part along its main axis, in metres. */
export function partLength(kind: PartKind, len?: number) {
  switch (kind) {
    case 'pipe':
      return (len ?? 200) * K;
    case 'valve':
      return VALVE_LEN * K;
    case 'tee':
      return TEE_LEN * K;
    case 'cap':
      return CAP_LEN * K;
    case 'elbow':
      return ELBOW_R * K;
  }
}

// ───────────────────────── part models ─────────────────────────
export interface PartProps {
  kind: PartKind;
  dia: 15 | 22;
  material: Material;
  len: number;
  turn: 'L' | 'R';
  side: 'L' | 'R';
  ghost?: 'ghost' | 'hot';
  tight: boolean;
  defective?: boolean;
}

export function PartModel(p: PartProps) {
  const M = mats();
  const r = (p.dia / 2) * K * 1.25;
  const g = p.ghost ? (p.ghost === 'hot' ? M.ghostHot : M.ghost) : null;
  const body = g ?? (p.material === 'copper' ? M.copper : p.material === 'pvc' ? M.pvc : M.galv);
  const fit = g ?? (p.material === 'pvc' ? M.pvc : p.tight ? M.nutTight : M.nutLoose);
  const brass = g ?? M.brass;
  const loose = p.tight ? 0 : 3;
  const nutLen = 12 * K;
  const Nut = ({ x, vertical = false }: { x: number; vertical?: boolean }) => (
    <mesh position={vertical ? [0, x, 0] : [x, 0, 0]} rotation={vertical ? [0, 0, 0] : [0, 0, Math.PI / 2]} castShadow material={fit}>
      <cylinderGeometry args={[r * 1.42, r * 1.42, nutLen, 6]} />
    </mesh>
  );
  const cyl = (x0: number, x1: number, rad: number, mat: THREE.Material, vertical = false) => (
    <mesh
      position={vertical ? [0, (x0 + x1) / 2, 0] : [(x0 + x1) / 2, 0, 0]}
      rotation={vertical ? [0, 0, 0] : [0, 0, Math.PI / 2]}
      castShadow
      receiveShadow
      material={mat}
    >
      <cylinderGeometry args={[rad, rad, Math.abs(x1 - x0), 28]} />
    </mesh>
  );

  switch (p.kind) {
    case 'pipe': {
      const L = p.len * K;
      return (
        <group>
          {cyl(0, L, r, body)}
          <Nut x={(6 - loose) * K} />
          <Nut x={L - (6 - loose) * K} />
        </group>
      );
    }
    case 'valve': {
      const L = VALVE_LEN * K;
      const lever = g ?? M.redPaint;
      return (
        <group>
          {cyl(0, L, r * 1.12, g ?? M.brass)}
          <mesh position={[L / 2, 0, 0]} castShadow material={brass}>
            <sphereGeometry args={[r * 1.9, 28, 20]} />
          </mesh>
          <mesh position={[L / 2, r * 2.4, 0]} castShadow material={brass}>
            <cylinderGeometry args={[r * 0.5, r * 0.55, r * 1.8, 16]} />
          </mesh>
          <mesh position={[L / 2 + r * 1.2, r * 3.5, 0]} castShadow material={lever}>
            <boxGeometry args={[r * 5, r * 0.55, r * 1.3]} />
          </mesh>
          <Nut x={(6 - loose) * K} />
          <Nut x={L - (6 - loose) * K} />
        </group>
      );
    }
    case 'elbow': {
      const R = ELBOW_R * K;
      const s = p.turn === 'L' ? 1 : -1;
      return (
        <group>
          <mesh
            position={[0, s * R, 0]}
            rotation={[0, 0, p.turn === 'L' ? -Math.PI / 2 : 0]}
            castShadow
            receiveShadow
            material={body}
          >
            <torusGeometry args={[R, r, 20, 36, Math.PI / 2]} />
          </mesh>
          <Nut x={(6 - loose) * K} />
          {/* second port nut: placed at the end point, axis along ±y */}
          <group position={[R, s * R, 0]}>
            <mesh position={[0, -s * (6 - loose) * K, 0]} castShadow material={fit}>
              <cylinderGeometry args={[r * 1.42, r * 1.42, nutLen, 6]} />
            </mesh>
          </group>
          {p.defective && !g && (
            <group position={[R * 0.707 + r * 0.55, s * R * 0.293 - s * r * 0.55, 0]} rotation={[0, 0, s * Math.PI / 4]}>
              <mesh>
                <boxGeometry args={[r * 0.12, r * 1.5, r * 0.5]} />
                <meshBasicMaterial color="#120a06" />
              </mesh>
            </group>
          )}
        </group>
      );
    }
    case 'tee': {
      const L = TEE_LEN * K;
      const s = p.side === 'L' ? 1 : -1;
      const bl = 40 * K;
      return (
        <group>
          {cyl(0, L, r, body)}
          <mesh position={[L / 2, s * (bl / 2), 0]} castShadow receiveShadow material={body}>
            <cylinderGeometry args={[r, r, bl, 28]} />
          </mesh>
          <Nut x={(6 - loose) * K} />
          <Nut x={L - (6 - loose) * K} />
          <group position={[L / 2, s * (bl - (6 - loose) * K), 0]}>
            <mesh castShadow material={fit}>
              <cylinderGeometry args={[r * 1.42, r * 1.42, nutLen, 6]} />
            </mesh>
          </group>
        </group>
      );
    }
    case 'cap': {
      const L = CAP_LEN * K;
      return (
        <group>
          {cyl(0, L * 0.7, r * 1.35, brass)}
          <mesh position={[L * 0.7, 0, 0]} scale={[0.7, 1, 1]} castShadow material={brass}>
            <sphereGeometry args={[r * 1.35, 24, 16]} />
          </mesh>
          <Nut x={(6 - loose) * K} />
        </group>
      );
    }
  }
}
