import type { ActionEvent, Scenario } from '../types';

export type DefectType = 'none' | 'porosity' | 'undercut' | 'lackFusion' | 'burnThrough' | 'spatter';

export const DEFECT_LABEL: Record<DefectType, string> = {
  none: 'No defect',
  porosity: 'Porosity',
  undercut: 'Undercut',
  lackFusion: 'Lack of fusion',
  burnThrough: 'Burn-through',
  spatter: 'Excess spatter',
};
export const DEFECT_TYPES = ['porosity', 'undercut', 'lackFusion', 'burnThrough', 'spatter'] as const;

export const SEGMENTS = 24;
export const SEAM_MM = 120;

export const WIRES = [
  { id: 'er70s6', label: 'ER70S-6 · 0.9 mm solid steel wire' },
  { id: 'er308l', label: 'ER308L · 0.9 mm stainless wire' },
  { id: 'e71t', label: 'E71T-GS · gasless flux-cored wire' },
];
export const GASES = [
  { id: 'arco2', label: 'Argon / CO₂ mix (80 / 20)' },
  { id: 'ar', label: '100 % Argon' },
  { id: 'co2', label: '100 % CO₂' },
  { id: 'none', label: 'No shielding gas' },
];
export const PRESETS = [
  { id: 'p90', amps: 90, label: '90 A · 17 V' },
  { id: 'p140', amps: 140, label: '140 A · 19 V' },
  { id: 'p200', amps: 200, label: '200 A · 22 V' },
  { id: 'p250', amps: 250, label: '250 A · 26 V' },
];
export const PPE_ITEMS = [
  { id: 'helmet', label: 'Auto-darkening welding helmet', icon: '🪖' },
  { id: 'gloves', label: 'Leather welding gauntlets', icon: '🧤' },
  { id: 'jacket', label: 'FR welding jacket', icon: '🥼' },
  { id: 'boots', label: 'Safety boots', icon: '🥾' },
  { id: 'glasses', label: 'Safety glasses', icon: '🥽' },
  { id: 'sunglasses', label: 'Sunglasses', icon: '🕶️' },
  { id: 'knit', label: 'Knitted cotton gloves', icon: '🧶' },
];
export const FLAMMABLE_LABEL: Record<string, string> = {
  rags: 'Oily rags',
  solvent: 'Solvent can',
  cardboard: 'Cardboard boxes',
};

export interface WPS {
  wire: string;
  gas: string;
  preset: string;
  flowMin: number;
  flowMax: number;
  angleMin: number;
  angleMax: number;
  speedMin: number;
  speedMax: number;
  gapMin: number;
  gapMax: number;
}

export interface WelderParams {
  mode: 'full' | 'inspect';
  joint: 'butt' | 'fillet';
  thickness: number;
  wps: WPS;
  fitGap: number;
  flammables: string[];
  preWelded?: DefectType[];
  acceptance: string;
}

export interface Seg {
  defect: DefectType;
  speed: number;
}

export interface WelderState {
  ppe: string[];
  vent: boolean;
  extinguisher: boolean;
  cleared: string[];
  wire: string | null;
  gas: string | null;
  preset: string | null;
  flow: number;
  angle: number;
  cleaned: boolean;
  gap: number | null;
  clamped: boolean;
  tacks: string[];
  segs: (Seg | null)[];
  next: number;
  arcOn: boolean;
  arcStarts: number;
  weldDone: boolean;
  inspectTool: string | null;
  flags: { seg: number; type: string }[];
  verdict: 'accept' | 'reject' | null;
  submitted: boolean;
}

export const ARC_EVENTS = ['tack', 'arc_start'];

export function initialWelder(scn: Scenario<WelderParams>): WelderState {
  const p = scn.params;
  const pre = p.preWelded;
  return {
    ppe: [],
    vent: false,
    extinguisher: false,
    cleared: [],
    wire: null,
    gas: null,
    preset: null,
    flow: 8,
    angle: 25,
    cleaned: !!pre,
    gap: null,
    clamped: !!pre,
    tacks: pre ? ['s', 'e'] : [],
    segs: pre ? pre.map((d) => ({ defect: d, speed: (p.wps.speedMin + p.wps.speedMax) / 2 })) : Array(SEGMENTS).fill(null),
    next: pre ? SEGMENTS : 0,
    arcOn: false,
    arcStarts: 0,
    weldDone: !!pre,
    inspectTool: null,
    flags: [],
    verdict: null,
    submitted: false,
  };
}

/** Deterministic bead-quality model from process parameters (illustrative only – not metallurgical truth). */
const AMPS: Record<string, number> = { p90: 90, p140: 140, p200: 200, p250: 250 };
export function beadDefect(st: WelderState, wps: WPS, speed: number, i: number): DefectType {
  const ar = (AMPS[st.preset ?? 'p140'] ?? 140) / (AMPS[wps.preset] ?? 140);
  const veryHot = ar > 1.6 || speed < wps.speedMin * 0.5 || (ar > 1.25 && speed < wps.speedMin);
  const hot = ar > 1.25 || speed < wps.speedMin * 0.75;
  const cold = ar < 0.8 || speed > wps.speedMax * 1.25;
  if (veryHot) return 'burnThrough';
  if (!st.gas || st.gas === 'none') return 'porosity';
  if (st.flow < wps.flowMin - 2.5 || st.flow > wps.flowMax + 9) return 'porosity';
  if (!st.cleaned && i % 3 === 1) return 'porosity';
  if (hot) return 'undercut';
  if (st.gas === 'ar') return 'undercut';
  if (cold) return 'lackFusion';
  if (st.gas === 'co2' || st.wire !== wps.wire) return 'spatter';
  if (st.angle < wps.angleMin - 6 || st.angle > wps.angleMax + 8) return 'spatter';
  if (st.tacks.length < 2 && i >= SEGMENTS / 2) return 'lackFusion';
  return 'none';
}

export function shouldReject(segs: (Seg | null)[]): boolean {
  const bad = segs.filter((s) => s && s.defect !== 'none') as Seg[];
  if (bad.some((b) => b.defect === 'burnThrough' || b.defect === 'lackFusion')) return true;
  return bad.length >= 2;
}

export function defectClusters(segs: (Seg | null)[]): { type: DefectType; from: number; to: number }[] {
  const out: { type: DefectType; from: number; to: number }[] = [];
  segs.forEach((s, i) => {
    if (!s || s.defect === 'none') return;
    const l = out[out.length - 1];
    if (l && l.type === s.defect && l.to === i - 1) l.to = i;
    else out.push({ type: s.defect, from: i, to: i });
  });
  return out;
}

export function reduceWelder(scn: Scenario<WelderParams>, s: WelderState, ev: ActionEvent): WelderState {
  const n: WelderState = {
    ...s,
    ppe: [...s.ppe],
    cleared: [...s.cleared],
    tacks: [...s.tacks],
    segs: [...s.segs],
    flags: [...s.flags],
  };
  const d = ev.data ?? {};
  switch (ev.type) {
    case 'ppe': {
      const item = String(d.item);
      n.ppe = d.on ? Array.from(new Set([...n.ppe, item])) : n.ppe.filter((x) => x !== item);
      break;
    }
    case 'vent':
      n.vent = !!d.on;
      break;
    case 'extinguisher':
      n.extinguisher = true;
      break;
    case 'clear':
      n.cleared = Array.from(new Set([...n.cleared, String(ev.obj)]));
      break;
    case 'set_wire':
      n.wire = String(d.v);
      break;
    case 'set_gas':
      n.gas = String(d.v);
      break;
    case 'set_preset':
      n.preset = String(d.v);
      break;
    case 'set_flow':
      n.flow = Number(d.v);
      break;
    case 'set_angle':
      n.angle = Number(d.v);
      break;
    case 'clean':
      n.cleaned = true;
      break;
    case 'measure_gap':
      n.gap = Number(d.mm);
      break;
    case 'clamp':
      n.clamped = true;
      break;
    case 'tack':
      n.tacks = Array.from(new Set([...n.tacks, String(ev.obj)]));
      break;
    case 'arc_start':
      n.arcOn = true;
      n.arcStarts += 1;
      break;
    case 'arc_stop':
      n.arcOn = false;
      break;
    case 'bead': {
      const i = Number(d.i);
      const speed = Number(d.speed);
      n.segs[i] = { defect: beadDefect(n, scn.params.wps, speed, i), speed };
      n.next = Math.max(n.next, i + 1);
      if (n.next >= SEGMENTS) n.weldDone = true;
      break;
    }
    case 'finish_weld':
      n.weldDone = true;
      n.arcOn = false;
      break;
    case 'inspect_tool':
      n.inspectTool = String(d.tool);
      break;
    case 'flag': {
      const seg = Number(d.seg);
      const type = String(d.type);
      const ex = n.flags.find((f) => f.seg === seg);
      if (ex && ex.type === type) n.flags = n.flags.filter((f) => f.seg !== seg);
      else n.flags = [...n.flags.filter((f) => f.seg !== seg), { seg, type }];
      break;
    }
    case 'verdict':
      n.verdict = String(d.v) as 'accept' | 'reject';
      break;
    case 'submit':
      n.submitted = true;
      break;
    default:
      break;
  }
  return n;
}
