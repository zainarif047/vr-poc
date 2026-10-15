export type PartKind = 'valve' | 'pipe' | 'elbow' | 'tee' | 'cap';
export type Material = 'copper' | 'pvc' | 'galv';

export interface PartSpec {
  id: string;
  kind: PartKind;
  material: Material;
  dia: 15 | 22;
  len?: number; // mm, straight pipe only
  defective?: boolean; // pre-installed faulty component (diagnosis scenario)
  label: string;
  sub: string;
}

const MAT: Record<Material, string> = { copper: 'Copper', pvc: 'PVC', galv: 'Galvanised steel' };
const KIND: Record<PartKind, string> = {
  valve: 'Isolation valve',
  pipe: 'Straight pipe',
  elbow: '90° elbow',
  tee: 'Equal tee',
  cap: 'Blanking cap',
};

const CATALOG: Record<string, PartSpec> = {};

function mk(kind: PartKind, material: Material, dia: 15 | 22, len?: number, defective = false): string {
  const id = `${kind}-${material}${dia}${len ? '-' + len : ''}${defective ? '-cracked' : ''}`;
  CATALOG[id] = {
    id,
    kind,
    material,
    dia,
    len,
    defective,
    label: `${KIND[kind]}${len ? ' · ' + len + ' mm' : ''}`,
    sub: `${MAT[material]} · ${dia} mm${defective ? ' · cracked body' : ''}`,
  };
  return id;
}

export const IDS = {
  valve15: mk('valve', 'copper', 15),
  valve22: mk('valve', 'copper', 22),
  elbow15: mk('elbow', 'copper', 15),
  elbow22: mk('elbow', 'copper', 22),
  elbowPvc15: mk('elbow', 'pvc', 15),
  elbowCracked15: mk('elbow', 'copper', 15, undefined, true),
  tee15: mk('tee', 'copper', 15),
  tee22: mk('tee', 'copper', 22),
  cap15: mk('cap', 'copper', 15),
  cap22: mk('cap', 'copper', 22),
  pvcPipe15_250: mk('pipe', 'pvc', 15, 250),
  galvPipe22_300: mk('pipe', 'galv', 22, 300),
};
for (const l of [100, 150, 200, 250, 300, 350]) {
  mk('pipe', 'copper', 15, l);
  mk('pipe', 'copper', 22, l);
}

export const pipeId = (dia: 15 | 22, len: number, material: Material = 'copper') =>
  `pipe-${material}${dia}-${len}`;

export function part(id: string): PartSpec {
  const p = CATALOG[id];
  if (!p) throw new Error('Unknown part ' + id);
  return p;
}

export interface ToolSpec {
  id: string;
  label: string;
  sub: string;
  icon: string;
}
export const TOOLS: ToolSpec[] = [
  { id: 'hand', label: 'Hand', sub: 'Remove / handle parts', icon: '✋' },
  { id: 'tape', label: 'Tape measure', sub: 'Measure a gap', icon: '📏' },
  { id: 'wrench', label: 'Adjustable wrench', sub: 'Tighten compression joints', icon: '🔧' },
  { id: 'hammer', label: 'Claw hammer', sub: 'General purpose', icon: '🔨' },
  { id: 'pliers', label: 'Slip-joint pliers', sub: 'General purpose', icon: '🗜️' },
  { id: 'marker', label: 'Leak marker', sub: 'Tag a leaking joint', icon: '📍' },
];

export const PPE_ITEMS = [
  { id: 'glasses', label: 'Safety glasses', icon: '🥽' },
  { id: 'gloves', label: 'Work gloves', icon: '🧤' },
  { id: 'sandals', label: 'Open sandals', icon: '🩴' },
];
