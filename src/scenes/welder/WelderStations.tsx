import { useEffect } from 'react';
import { scenarioById } from '../../engine';
import type { Scenario } from '../../engine/types';
import { DEFECT_LABEL, DEFECT_TYPES, PPE_ITEMS, type WelderParams, type WelderState } from '../../engine/welder/reducer';
import { Block, Hit } from '../../fps/Hit';
import { GLOVE_COLORS, PpeModel, SKIN, ToolModel } from '../../fps/models';
import { FpsPlayer, type Box } from '../../fps/Player';
import { rt, useFps, useFpsActive } from '../../fps/runtime';
import { Viewmodel, type HeldItem } from '../../fps/Viewmodel';
import { useSession } from '../../store/session';
import { JobCard } from '../common/JobCard';
import { Label as Html } from '../common/Label';
import { mats } from '../common/materials';

// Walkable welding bay: back wall at z = -1.5, bench in the middle, machine to the right.
export const WELDER_ROOM: Box = { minX: -4, maxX: 4, minZ: -1.5, maxZ: 3.5 };

const RACK_X = -3.0;
const RACK_Z = -1.27;
const CART: Box = { minX: -2.2, maxX: -1.1, minZ: 0.74, maxZ: 1.2 };
const CART_TOP = 0.86;

export const WELDER_COLLIDERS: Box[] = [
  { minX: -1.15, maxX: 1.15, minZ: -0.5, maxZ: 0.5 }, // welding bench
  { minX: 1.37, maxX: 1.93, minZ: -0.37, maxZ: 0.17 }, // MIG machine
  { minX: -1.82, maxX: -1.58, minZ: -0.47, maxZ: -0.23 }, // gas cylinder
  { minX: 2.45, maxX: 2.65, minZ: 0.1, maxZ: 0.3 }, // extinguisher
  { minX: RACK_X - 0.6, maxX: RACK_X + 0.6, minZ: -1.5, maxZ: -1.05 }, // PPE rack
  CART,
];

const session = () => useSession.getState();
const wstate = () => session().state as WelderState;

export const HAND_TOOLS: Record<string, { label: string; sub: string }> = {
  torch: { label: 'MIG torch', sub: 'Hold click on the joint to weld · right-click to tack' },
  brush: { label: 'Wire brush', sub: 'Clean mill scale from the joint' },
  gapgauge: { label: 'Gap gauge', sub: 'Measure the root gap' },
  clamp: { label: 'C-clamps', sub: 'Clamp the coupon to the bench' },
  gauge: { label: 'Weld gauge', sub: 'Inspection tool' },
  magnifier: { label: 'Magnifier', sub: 'Inspection tool' },
};

/** Pick up a hand item. Inspection tools are recorded (inspect_tool) and refused before the weld is finished. */
export function takeItem(id: string) {
  if (id === 'gauge' || id === 'magnifier') {
    if (!session().act('inspect_tool', undefined, { tool: id })) return;
  }
  useFps.setState({ held: id });
}

// where each PPE item sits on the rack (classic view shows the same rack, non-interactive)
const PPE_POS: Record<string, [number, number, number]> = {
  helmet: [RACK_X - 0.36, 1.1, RACK_Z + 0.03],
  glasses: [RACK_X + 0.02, 1.03, RACK_Z + 0.08],
  sunglasses: [RACK_X + 0.32, 1.03, RACK_Z + 0.08],
  gloves: [RACK_X - 0.28, 0.54, RACK_Z + 0.05],
  knit: [RACK_X + 0.25, 0.54, RACK_Z + 0.05],
  boots: [RACK_X, 0.03, RACK_Z + 0.05],
  jacket: [RACK_X + 0.95, 1.4, -1.45],
};

function PpeRack({ fps, inspectOnly }: { fps: boolean; inspectOnly: boolean }) {
  const ppe = useSession((s) => (s.state as WelderState).ppe);
  const M = mats();
  const items = inspectOnly ? PPE_ITEMS.filter((x) => ['glasses', 'gloves', 'sunglasses', 'knit'].includes(x.id)) : PPE_ITEMS;
  return (
    <group>
      {[0.5, 1.0].map((y) => (
        <mesh key={y} position={[RACK_X, y, RACK_Z]} castShadow receiveShadow material={M.darkMetal}>
          <boxGeometry args={[1.2, 0.03, 0.42]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[RACK_X + s * 0.59, 0.6, RACK_Z]} castShadow material={M.darkMetal}>
          <boxGeometry args={[0.03, 1.2, 0.42]} />
        </mesh>
      ))}
      <mesh position={[RACK_X + 0.95, 1.62, -1.47]} material={M.steel}>
        <boxGeometry args={[0.04, 0.04, 0.06]} />
      </mesh>
      {items.map((p) => {
        const pos = PPE_POS[p.id];
        const worn = ppe.includes(p.id);
        return (
          <group key={p.id}>
            {!worn && (
              <group position={pos} rotation={[p.id.endsWith('glasses') ? -0.2 : 0, 0, 0]}>
                <PpeModel id={p.id} trade="welder" />
              </group>
            )}
            <Hit
              size={p.id === 'jacket' ? [0.5, 0.5, 0.14] : [0.3, p.id === 'helmet' ? 0.3 : 0.16, 0.36]}
              position={[pos[0], pos[1] + (p.id === 'jacket' ? 0 : 0.05), pos[2] + (p.id === 'jacket' ? 0.04 : 0)]}
              enabled={fps}
              spec={() => {
                const on = wstate().ppe.includes(p.id);
                return {
                  id: 'ppe:' + p.id,
                  title: p.label,
                  sub: on ? 'You are wearing this' : 'PPE rack',
                  tone: on ? 'ok' : undefined,
                  actions: [{ key: 'F', label: on ? 'Take off' : 'Put on', run: () => session().act('ppe', undefined, { item: p.id, on: !on }) }],
                };
              }}
            />
          </group>
        );
      })}
      <Html position={[RACK_X, 1.42, RACK_Z]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">PPE rack</div>
      </Html>
    </group>
  );
}

function ToolCart({ fps, inspectOnly }: { fps: boolean; inspectOnly: boolean }) {
  const held = useFps((s) => s.held);
  const M = mats();
  const ids = inspectOnly ? ['gauge', 'magnifier'] : ['brush', 'gapgauge', 'clamp', 'gauge', 'magnifier'];
  const cx = (CART.minX + CART.maxX) / 2;
  const cz = (CART.minZ + CART.maxZ) / 2;
  return (
    <group>
      <mesh position={[cx, CART_TOP - 0.02, cz]} castShadow receiveShadow material={M.table}>
        <boxGeometry args={[CART.maxX - CART.minX, 0.04, CART.maxZ - CART.minZ]} />
      </mesh>
      <mesh position={[cx, 0.3, cz]} castShadow receiveShadow material={M.darkMetal}>
        <boxGeometry args={[CART.maxX - CART.minX - 0.04, 0.03, CART.maxZ - CART.minZ - 0.04]} />
      </mesh>
      {[CART.minX + 0.03, CART.maxX - 0.03].flatMap((x) =>
        [CART.minZ + 0.03, CART.maxZ - 0.03].map((z) => (
          <mesh key={`${x}${z}`} position={[x, CART_TOP / 2, z]} castShadow material={M.darkMetal}>
            <boxGeometry args={[0.03, CART_TOP, 0.03]} />
          </mesh>
        )),
      )}
      <Block size={[CART.maxX - CART.minX, CART_TOP, CART.maxZ - CART.minZ]} position={[cx, CART_TOP / 2, cz]} enabled={fps} />
      {ids.map((id, i) => {
        const x = CART.minX + 0.13 + i * 0.15;
        return (
          <group key={id}>
            {(!fps || held !== id) && (
              <group position={[x, CART_TOP + 0.012, cz + 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
                <ToolModel id={id} />
              </group>
            )}
            <Hit
              size={[0.14, 0.12, 0.3]}
              position={[x, CART_TOP + 0.05, cz]}
              enabled={fps}
              spec={() => {
                if (useFps.getState().held === id) return null;
                const t = HAND_TOOLS[id];
                return { id: 'item:' + id, title: t.label, sub: t.sub, actions: [{ key: 'F', label: useFps.getState().held ? 'Swap for this' : 'Pick up', run: () => takeItem(id) }] };
              }}
            />
          </group>
        );
      })}
      <JobCard position={[CART.maxX - 0.16, CART_TOP + 0.008, cz]} rotation={[-Math.PI / 2, 0, 0]} fps={fps} />
      <Html position={[cx, CART_TOP + 0.3, cz]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">Tool cart</div>
      </Html>
    </group>
  );
}

export function WelderStations() {
  const fps = useFpsActive();
  const scnId = useSession((s) => s.scenarioId);
  const inspectOnly = (scenarioById(scnId) as Scenario<WelderParams>).params.mode === 'inspect';
  return (
    <>
      <PpeRack fps={fps} inspectOnly={inspectOnly} />
      <ToolCart fps={fps} inspectOnly={inspectOnly} />
    </>
  );
}

// ───────────────────────── first-person rig ─────────────────────────
export function WelderFps() {
  const held = useFps((s) => s.held);
  const ppe = useSession((s) => (s.state as WelderState).ppe);

  useEffect(() => {
    rt.handlers = {
      stow: () => {
        if (useFps.getState().held) useFps.setState({ held: null });
      },
      cycle: (d) => {
        const h = useFps.getState().held;
        if (h !== 'gauge' && h !== 'magnifier') return;
        const cur = session().defectType;
        const i = Math.max(0, DEFECT_TYPES.indexOf(cur as (typeof DEFECT_TYPES)[number]));
        const next = DEFECT_TYPES[(i + d + DEFECT_TYPES.length) % DEFECT_TYPES.length];
        session().patch({ defectType: next });
        session().toastMsg(`Defect type: ${DEFECT_LABEL[next]}`, 'info');
      },
    };
    return () => {
      rt.handlers = {};
    };
  }, []);

  const glove = welderGlove(ppe);
  const sleeve = welderSleeve(ppe);
  const item: HeldItem | null = held
    ? { node: <ToolModel id={held} />, rot: held === 'torch' ? [-0.55, 0, 0] : [-0.95, 0, 0], twist: held === 'brush' }
    : null;

  return (
    <>
      <FpsPlayer start={[0, 1.7, 0]} bounds={WELDER_ROOM} colliders={WELDER_COLLIDERS} />
      <Viewmodel item={item} glove={glove} sleeve={sleeve} hideRight={() => rt.torchOnSeam} />
    </>
  );
}

export const welderGlove = (ppe: string[]) => (ppe.includes('gloves') ? GLOVE_COLORS.gauntlets : ppe.includes('knit') ? GLOVE_COLORS.knit : SKIN);
export const welderSleeve = (ppe: string[]) => (ppe.includes('jacket') ? '#24364f' : '#5d6672');
