import { useFrame } from '@react-three/fiber';
import { useEffect } from 'react';
import { scenarioById } from '../../engine';
import { PPE_ITEMS, TOOLS, part } from '../../engine/plumber/catalog';
import type { PlumberParams, PlumberState } from '../../engine/plumber/reducer';
import type { Scenario } from '../../engine/types';
import { Block, Hit } from '../../fps/Hit';
import { GLOVE_COLORS, PpeModel, SKIN, ToolModel } from '../../fps/models';
import { FpsPlayer, type Box } from '../../fps/Player';
import { rt, useFps, useFpsActive, type FpsSpec } from '../../fps/runtime';
import { JobCard } from '../common/JobCard';
import { Viewmodel, type HeldItem } from '../../fps/Viewmodel';
import { useSession } from '../../store/session';
import { Label as Html } from '../common/Label';
import { mats } from '../common/materials';
import { PartModel, partLength } from './PartModel';

// Walkable plumbing bay: back wall (training rig) at z≈0, stores on the right wall, tool board on the left wall.
export const PLUMBER_ROOM: Box = { minX: -5, maxX: 5, minZ: -0.02, maxZ: 6.5 };

const PPE_X = -3.1;
const BOARD_X = -4.97;
const BOARD_Z = 2.2;
const STORE_X = 4.72;
const PIPE_Z0 = 0.9;
const PIPE_DZ = 0.2;
const FIT_DZ = 0.32;

const session = () => useSession.getState();
const pstate = () => session().state as PlumberState;
const toolLabel = (id: string) => TOOLS.find((t) => t.id === id)?.label ?? id;

function storeLayout(tray: string[]) {
  const pipes = tray.filter((id) => part(id).kind === 'pipe');
  const fittings = tray.filter((id) => part(id).kind !== 'pipe');
  const rackLen = pipes.length * PIPE_DZ + 0.2;
  const benchZ0 = PIPE_Z0 - 0.1 + rackLen + 0.3;
  const benchLen = fittings.length * FIT_DZ + 0.2;
  return { pipes, fittings, rackLen, benchZ0, benchLen };
}

export function plumberColliders(tray: string[]): Box[] {
  const L = storeLayout(tray);
  return [
    { minX: PPE_X - 0.45, maxX: PPE_X + 0.45, minZ: 0, maxZ: 0.52 }, // PPE cabinet
    { minX: -5, maxX: -4.45, minZ: BOARD_Z - 0.85, maxZ: BOARD_Z + 0.85 }, // bench under the tool board
    { minX: STORE_X - 0.25, maxX: 5, minZ: PIPE_Z0 - 0.1, maxZ: PIPE_Z0 - 0.1 + L.rackLen }, // pipe rack
    { minX: 4.28, maxX: 5, minZ: L.benchZ0, maxZ: L.benchZ0 + L.benchLen }, // fittings bench
    { minX: -2.45, maxX: -1.75, minZ: 0.7, maxZ: 1.1 }, // toolbox
    { minX: 1.8, maxX: 2.2, minZ: 0.5, maxZ: 0.9 }, // bucket
  ];
}

// ───────────────────────── PPE cabinet ─────────────────────────
function PpeCabinet({ fps }: { fps: boolean }) {
  const ppe = useSession((s) => (s.state as PlumberState).ppe);
  const M = mats();
  return (
    <group>
      <mesh position={[PPE_X, 0.47, 0.26]} castShadow receiveShadow material={M.bluePaint}>
        <boxGeometry args={[0.9, 0.94, 0.5]} />
      </mesh>
      <mesh position={[PPE_X, 0.47, 0.515]} material={M.darkMetal}>
        <boxGeometry args={[0.02, 0.8, 0.01]} />
      </mesh>
      <Block size={[0.9, 0.94, 0.5]} position={[PPE_X, 0.47, 0.26]} enabled={fps} />
      {PPE_ITEMS.map((p, i) => {
        const x = PPE_X - 0.28 + i * 0.28;
        const worn = ppe.includes(p.id);
        return (
          <group key={p.id}>
            {!worn && (
              <group position={[x, p.id === 'sandals' ? 0.95 : 0.975, 0.28]} rotation={[p.id === 'glasses' ? -0.2 : 0, 0, 0]}>
                <PpeModel id={p.id} trade="plumber" />
              </group>
            )}
            <Hit
              size={[0.26, 0.16, 0.34]}
              position={[x, 1.02, 0.28]}
              enabled={fps}
              spec={() => {
                const on = pstate().ppe.includes(p.id);
                return {
                  id: 'ppe:' + p.id,
                  title: p.label,
                  sub: on ? 'You are wearing this' : 'PPE cabinet',
                  tone: on ? 'ok' : undefined,
                  actions: [{ key: 'F', label: on ? 'Take off' : 'Put on', run: () => session().act('ppe', undefined, { item: p.id, on: !on }) }],
                };
              }}
            />
          </group>
        );
      })}
      <Html position={[PPE_X, 1.3, 0.28]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">PPE</div>
      </Html>
    </group>
  );
}

// ───────────────────────── tool shadow board ─────────────────────────
function ToolBoard({ fps }: { fps: boolean }) {
  const belt = useFps((s) => s.belt);
  const tool = useSession((s) => (s.state as PlumberState).tool);
  const M = mats();
  const tools = TOOLS.filter((t) => t.id !== 'hand');
  return (
    <group>
      <mesh position={[BOARD_X, 1.42, BOARD_Z]} receiveShadow>
        <boxGeometry args={[0.03, 0.78, 1.7]} />
        <meshStandardMaterial color="#8a6a47" roughness={0.85} />
      </mesh>
      <mesh position={[-4.725, 0.44, BOARD_Z]} castShadow receiveShadow material={M.table}>
        <boxGeometry args={[0.55, 0.88, 1.7]} />
      </mesh>
      <Block size={[0.55, 0.88, 1.7]} position={[-4.725, 0.44, BOARD_Z]} enabled={fps} />
      {tools.map((t, i) => {
        const z = BOARD_Z - 0.64 + i * 0.32;
        // in classic view the HUD owns the tools, so the board stays full
        const taken = fps && (belt.includes(t.id) || tool === t.id);
        return (
          <group key={t.id}>
            <mesh position={[BOARD_X + 0.017, 1.42, z]}>
              <boxGeometry args={[0.004, 0.3, 0.12]} />
              <meshBasicMaterial color="#2a1f15" />
            </mesh>
            {!taken && (
              <group position={[BOARD_X + 0.04, 1.32, z]} rotation={[0, Math.PI / 2, 0]} scale={1.25}>
                <ToolModel id={t.id} />
              </group>
            )}
            <Hit
              size={[0.1, 0.36, 0.28]}
              position={[BOARD_X + 0.06, 1.42, z]}
              enabled={fps}
              spec={() => {
                const b = useFps.getState().belt;
                const onBelt = b.includes(t.id);
                return {
                  id: 'tool:' + t.id,
                  title: t.label,
                  sub: onBelt ? 'On your tool belt' : t.sub,
                  actions: onBelt
                    ? [
                        {
                          key: 'F',
                          label: 'Hang back on the board',
                          run: () => {
                            useFps.setState({ belt: b.filter((x) => x !== t.id) });
                            if (pstate().tool === t.id) session().act('tool', undefined, { tool: 'hand' });
                          },
                        },
                      ]
                    : [
                        {
                          key: 'F',
                          label: 'Take',
                          run: () => {
                            useFps.setState({ belt: [...b, t.id] });
                            session().patch({ armed: null });
                            session().act('tool', undefined, { tool: t.id });
                          },
                        },
                      ],
                };
              }}
            />
          </group>
        );
      })}
      <Html position={[BOARD_X + 0.05, 1.92, BOARD_Z]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">Tool board</div>
      </Html>
    </group>
  );
}

// ───────────────────────── stores: pipe rack + fittings bench ─────────────────────────
function Stores({ tray, fps }: { tray: string[]; fps: boolean }) {
  const armed = useSession((s) => s.armed);
  const M = mats();
  const L = storeLayout(tray);
  const rackZc = PIPE_Z0 - 0.1 + L.rackLen / 2;
  const benchZc = L.benchZ0 + L.benchLen / 2;
  const partSpec = (id: string) => (): FpsSpec | null => {
    if (session().armed === id) return null;
    const p = part(id);
    return {
      id: 'part:' + id,
      title: p.label,
      sub: p.sub,
      actions: [{ key: 'F', label: session().armed ? 'Swap for this part' : 'Pick up', run: () => session().patch({ armed: id }) }],
    };
  };
  return (
    <group>
      {/* pipe rack */}
      <mesh position={[STORE_X, 0.04, rackZc]} castShadow receiveShadow material={M.darkMetal}>
        <boxGeometry args={[0.4, 0.08, L.rackLen]} />
      </mesh>
      <mesh position={[STORE_X, 1.14, rackZc]} castShadow material={M.darkMetal}>
        <boxGeometry args={[0.4, 0.04, L.rackLen]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[STORE_X + 0.18, 0.6, rackZc + (s * L.rackLen) / 2]} castShadow material={M.darkMetal}>
          <boxGeometry args={[0.04, 1.1, 0.04]} />
        </mesh>
      ))}
      {L.pipes.map((id, i) => {
        const p = part(id);
        const len = partLength(p.kind, p.len);
        const z = PIPE_Z0 + i * PIPE_DZ;
        return (
          <group key={id}>
            {armed !== id && (
              <group position={[STORE_X - 0.06, 0.09, z]} rotation={[0, 0, Math.PI / 2]}>
                <PartModel kind="pipe" dia={p.dia} material={p.material} len={p.len ?? 0} turn="L" side="L" tight />
              </group>
            )}
            <Hit size={[0.2, len + 0.06, 0.18]} position={[STORE_X - 0.06, 0.09 + len / 2, z]} spec={partSpec(id)} enabled={fps} />
          </group>
        );
      })}
      <Html position={[STORE_X - 0.1, 1.3, rackZc]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">Pipe stock</div>
      </Html>

      {/* fittings bench */}
      <mesh position={[4.64, 0.44, benchZc]} castShadow receiveShadow material={M.table}>
        <boxGeometry args={[0.72, 0.88, L.benchLen]} />
      </mesh>
      <Block size={[0.72, 0.88, L.benchLen]} position={[4.64, 0.44, benchZc]} enabled={fps} />
      {L.fittings.map((id, i) => {
        const p = part(id);
        const len = partLength(p.kind, p.len);
        const z = L.benchZ0 + 0.26 + i * FIT_DZ;
        return (
          <group key={id}>
            {armed !== id && (
              <group position={[4.55, 0.92, z]} rotation={[0, -Math.PI / 2, 0]}>
                <group position={[-len / 2, 0, 0]}>
                  <PartModel kind={p.kind} dia={p.dia} material={p.material} len={p.len ?? 0} turn="L" side="L" tight defective={p.defective} />
                </group>
              </group>
            )}
            <Hit size={[0.3, 0.2, 0.28]} position={[4.55, 0.98, z]} spec={partSpec(id)} enabled={fps} />
          </group>
        );
      })}
      <Html position={[4.5, 1.3, benchZc]} center style={{ pointerEvents: 'none' }}>
        <div className="chip chip-mute">Fittings</div>
      </Html>
    </group>
  );
}

// ───────────────────────── wall panels ─────────────────────────
function TestPanel({ x, fps }: { x: number; fps: boolean }) {
  const M = mats();
  const last = useSession((s) => (s.state as PlumberState).lastTest);
  const lamp = last === 'pass' ? '#3ce0a0' : last === 'leak' ? '#ff4d5e' : '#445063';
  return (
    <group position={[x, 1.45, 0.06]}>
      <mesh castShadow material={M.darkMetal}>
        <boxGeometry args={[0.28, 0.34, 0.06]} />
      </mesh>
      <mesh position={[0, -0.06, 0.035]} rotation={[Math.PI / 2, 0, 0]} material={M.redPaint}>
        <cylinderGeometry args={[0.04, 0.04, 0.025, 24]} />
      </mesh>
      <mesh position={[0, 0.09, 0.032]}>
        <circleGeometry args={[0.022, 20]} />
        <meshBasicMaterial color={lamp} toneMapped={false} />
      </mesh>
      <Hit
        size={[0.32, 0.38, 0.14]}
        position={[0, 0, 0.03]}
        enabled={fps}
        spec={() => {
          const st = pstate();
          const res = { none: 'not run yet', pass: 'PASS', leak: `LEAK at ${st.leaks.length} joint(s)`, incomplete: 'not run – route incomplete', blocked: 'not run – supply closed' }[st.lastTest];
          return {
            id: 'testpanel',
            title: 'Pressure test panel',
            sub: `Gauge ${st.pressure.toFixed(1)} bar · last test: ${res}`,
            tone: st.lastTest === 'pass' ? 'ok' : st.lastTest === 'leak' ? 'bad' : undefined,
            actions: [{ key: 'E', label: 'Run pressure test', run: () => session().act('pressure_test') }],
          };
        }}
      />
      <Html position={[0, 0.25, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="chip">Pressure test</div>
      </Html>
    </group>
  );
}

export function PlumberStations({ sx, rigHalf }: { sx: number; rigHalf: number }) {
  const fps = useFpsActive();
  const scnId = useSession((s) => s.scenarioId);
  const tray = (scenarioById(scnId) as Scenario<PlumberParams>).params.tray;
  return (
    <>
      <PpeCabinet fps={fps} />
      <ToolBoard fps={fps} />
      <Stores tray={tray} fps={fps} />
      <TestPanel x={sx - 0.5} fps={fps} />
      <JobCard position={[rigHalf + 0.35, 1.45, 0.03]} fps={fps} />
    </>
  );
}

// ───────────────────────── first-person rig ─────────────────────────
function HeldPart({ id }: { id: string }) {
  const p = part(id);
  const len = partLength(p.kind, p.len);
  const s = Math.min(0.85, 0.34 / len);
  return (
    <group scale={s}>
      <group position={[-len / 2, 0, 0]}>
        <PartModel kind={p.kind} dia={p.dia} material={p.material} len={p.len ?? 0} turn="L" side="L" tight={false} defective={p.defective} />
      </group>
    </group>
  );
}

export function PlumberFps({ tray }: { tray: string[] }) {
  const armed = useSession((s) => s.armed);
  const tool = useSession((s) => (s.state as PlumberState).tool);
  const ppe = useSession((s) => (s.state as PlumberState).ppe);

  useEffect(() => {
    const hotbar = () => ['hand', ...useFps.getState().belt];
    const select = (id: string) => {
      const s = session();
      s.patch({ armed: null });
      if (pstate().tool !== id) s.act('tool', undefined, { tool: id });
    };
    rt.handlers = {
      stow: () => {
        const s = session();
        if (s.armed) {
          s.patch({ armed: null });
          s.toastMsg('Part returned to the stores.', 'info');
        } else if (pstate().tool !== 'hand') select('hand');
      },
      slot: (n) => {
        const id = hotbar()[n - 1];
        if (id) select(id);
      },
      cycle: (d) => {
        const list = hotbar();
        const i = Math.max(0, list.indexOf(pstate().tool));
        select(list[(i + d + list.length) % list.length]);
      },
    };
    return () => {
      rt.handlers = {};
    };
  }, []);

  // ghost highlight on the slot under the crosshair
  useFrame(() => {
    const id = rt.focus?.spec.id;
    const slot = id?.startsWith('slot:') ? id.slice(5) : null;
    if (session().hoverSlot !== slot) useSession.setState({ hoverSlot: slot });
  });

  const item: HeldItem | null = armed
    ? { node: <HeldPart id={armed} />, rot: [0.1, 0.5, 0.05], pos: [-0.04, 0.03, -0.12] }
    : tool && tool !== 'hand'
      ? { node: <ToolModel id={tool} />, twist: ['wrench', 'pliers'].includes(tool) }
      : null;

  return (
    <>
      <FpsPlayer start={[0, 3.0, 0]} bounds={PLUMBER_ROOM} colliders={plumberColliders(tray)} />
      <Viewmodel item={item} glove={ppe.includes('gloves') ? GLOVE_COLORS.gloves : SKIN} sleeve="#3d4c5f" />
    </>
  );
}

export { toolLabel };
