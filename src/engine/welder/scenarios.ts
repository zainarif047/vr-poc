import type { Competency, Criterion, EvalContext, Question, Scenario } from '../types';
import { evidenceOf, seqs } from '../helpers';
import {
  ARC_EVENTS,
  DEFECT_LABEL,
  SEGMENTS,
  defectClusters,
  shouldReject,
  type DefectType,
  type WelderParams,
  type WelderState,
} from './reducer';

// Welder matrix weights (proposal §4.5, discovery inputs).
export const WELDER_COMPETENCIES: Competency[] = [
  { id: 'safety', label: 'Safety', weight: 20 },
  { id: 'equip', label: 'Equipment and preparation', weight: 15 },
  { id: 'knowledge', label: 'Knowledge and instructions', weight: 10 },
  { id: 'practical', label: 'Practical execution', weight: 30 },
  { id: 'defects', label: 'Defect identification', weight: 10 },
  { id: 'inspection', label: 'Inspection and quality', weight: 15 },
];

type Ctx = EvalContext<WelderState>;
type Step = Ctx['timeline'][number];
const wps = (c: Ctx) => (c.scenario.params as WelderParams).wps;
const isArc = (s: Step) => ARC_EVENTS.includes(s.ev.type);
const firstArc = (c: Ctx) => c.timeline.find(isArc);
const firstBead = (c: Ctx) => c.timeline.find((s) => s.ev.type === 'bead');

const arcNeeded = { passed: null as boolean | null, evidence: [] as number[], note: 'No arc event recorded' };

const safety: Criterion<WelderState>[] = [
  {
    id: 'helmet',
    competency: 'safety',
    critical: true,
    label: 'Welding helmet worn before every arc strike',
    sop: 'SOP-WLD §2.1 Eye/face protection before arc (CRITICAL)',
    weight: 2,
    check: (c) => {
      const arcs = c.timeline.filter(isArc);
      if (!arcs.length) return arcNeeded;
      const bad = arcs.filter((s) => !s.before.ppe.includes('helmet'));
      return {
        passed: bad.length === 0,
        evidence: bad.length ? seqs(bad.map((b) => b.ev)).slice(0, 5) : [arcs[0].ev.seq],
        note: bad.length ? 'Arc struck without a welding helmet – arc-eye / burn hazard' : undefined,
      };
    },
  },
  {
    id: 'flammables',
    competency: 'safety',
    critical: true,
    label: 'Flammable materials removed from the work area before welding',
    sop: 'SOP-WLD §2.2 Hot-work area cleared (CRITICAL)',
    weight: 2,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      const left = (c.scenario.params as WelderParams).flammables.filter((f) => !a.before.cleared.includes(f));
      return {
        passed: left.length === 0,
        evidence: [a.ev.seq],
        note: left.length ? `Still near the arc: ${left.join(', ')}` : undefined,
      };
    },
  },
  {
    id: 'ppe_body',
    competency: 'safety',
    label: 'Gauntlets, FR jacket and safety boots worn; no unsuitable items',
    sop: 'SOP-WLD §2.3 Full PPE ensemble',
    weight: 1,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      const p = a.before.ppe;
      const ok = p.includes('gloves') && p.includes('jacket') && p.includes('boots') && !p.includes('sunglasses') && !p.includes('knit');
      return { passed: ok, evidence: [a.ev.seq], note: ok ? undefined : `PPE at first arc: ${p.join(', ') || 'none'}` };
    },
  },
  {
    id: 'ventilation',
    competency: 'safety',
    label: 'Fume extraction / ventilation running during welding',
    sop: 'SOP-WLD §2.4 Ventilation on',
    weight: 1,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      return { passed: a.before.vent, evidence: [a.ev.seq] };
    },
  },
  {
    id: 'extinguisher',
    competency: 'safety',
    label: 'Fire extinguisher located and checked',
    sop: 'SOP-WLD §2.5 Fire watch equipment checked',
    weight: 1,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      return { passed: a.before.extinguisher, evidence: [a.ev.seq] };
    },
  },
];

const inspectSafety: Criterion<WelderState>[] = [
  {
    id: 'insp_ppe',
    competency: 'safety',
    label: 'Eye protection and gloves worn before handling the coupon',
    sop: 'SOP-WLD §2.6 PPE for inspection and handling',
    weight: 1,
    check: (c) => {
      const t = c.timeline.find((s) => s.ev.type === 'inspect_tool' || s.ev.type === 'flag');
      if (!t) return { passed: null, evidence: [], note: 'No inspection action recorded' };
      const p = t.before.ppe;
      const ok = p.includes('glasses') && p.includes('gloves') && !p.includes('sunglasses');
      return { passed: ok, evidence: [t.ev.seq], note: ok ? undefined : `PPE at first inspection action: ${p.join(', ') || 'none'}` };
    },
  },
];

const equip: Criterion<WelderState>[] = [
  {
    id: 'wire',
    competency: 'equip',
    label: 'Correct filler wire loaded for the material',
    sop: 'SOP-WLD §3.1 Consumables per WPS',
    weight: 1,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      return { passed: a.before.wire === wps(c).wire, evidence: [a.ev.seq], note: `Loaded: ${a.before.wire ?? 'none'}` };
    },
  },
  {
    id: 'gas',
    competency: 'equip',
    label: 'Correct shielding gas connected',
    sop: 'SOP-WLD §3.2 Shielding gas per WPS',
    weight: 1,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      return { passed: a.before.gas === wps(c).gas, evidence: [a.ev.seq], note: `Selected: ${a.before.gas ?? 'none'}` };
    },
  },
  {
    id: 'flow',
    competency: 'equip',
    label: 'Gas flow rate within the WPS range',
    sop: 'SOP-WLD §3.3 Gas flow 12–16 L/min',
    weight: 1,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      const w = wps(c);
      return { passed: a.before.flow >= w.flowMin && a.before.flow <= w.flowMax, evidence: [a.ev.seq], note: `Set: ${a.before.flow} L/min` };
    },
  },
  {
    id: 'preset',
    competency: 'equip',
    label: 'Machine current/voltage preset matches plate thickness',
    sop: 'SOP-WLD §3.4 Current preset per WPS',
    weight: 1,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      return { passed: a.before.preset === wps(c).preset, evidence: [a.ev.seq], note: `Selected: ${a.before.preset ?? 'none'}` };
    },
  },
  {
    id: 'clean',
    competency: 'equip',
    label: 'Joint faces cleaned (mill scale / contamination removed)',
    sop: 'SOP-WLD §4.1 Joint preparation',
    weight: 1,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      return { passed: a.before.cleaned, evidence: [a.ev.seq] };
    },
  },
  {
    id: 'gap',
    competency: 'equip',
    label: 'Fit-up gap measured before tacking',
    sop: 'SOP-WLD §4.2 Fit-up verified with gauge',
    weight: 1,
    check: (c) => {
      const a = firstArc(c);
      if (!a) return arcNeeded;
      return { passed: a.before.gap !== null, evidence: evidenceOf(c.events, 'measure_gap') };
    },
  },
  {
    id: 'tack',
    competency: 'equip',
    label: 'Parts clamped and tack-welded (≥ 2 tacks) before the root pass',
    sop: 'SOP-WLD §4.3 Clamp then tack',
    weight: 1,
    check: (c) => {
      const b = c.timeline.find((s) => s.ev.type === 'arc_start');
      if (!b) return { passed: false, evidence: [], note: 'No weld pass started' };
      const tacksUnclamped = c.timeline.filter((s) => s.ev.type === 'tack' && !s.before.clamped);
      const ok = b.before.clamped && b.before.tacks.length >= 2 && tacksUnclamped.length === 0;
      return { passed: ok, evidence: evidenceOf(c.events, 'clamp', 'tack'), note: ok ? undefined : 'Insufficient clamping/tacking before welding' };
    },
  },
];

const knowledgeRules: Criterion<WelderState>[] = [
  {
    id: 'wps',
    competency: 'knowledge',
    label: 'Machine and technique settings follow the work instruction (WPS)',
    sop: 'SOP-WLD §1.1 Follow the WPS as written',
    weight: 2,
    check: (c) => {
      const b = firstBead(c);
      if (!b) return { passed: false, evidence: [], note: 'No weld bead recorded' };
      const w = wps(c);
      const s = b.before;
      const bad: string[] = [];
      if (s.wire !== w.wire) bad.push('wire');
      if (s.gas !== w.gas) bad.push('gas');
      if (s.preset !== w.preset) bad.push('current');
      if (s.flow < w.flowMin || s.flow > w.flowMax) bad.push('gas flow');
      if (s.angle < w.angleMin || s.angle > w.angleMax) bad.push('torch angle');
      return { passed: bad.length === 0, evidence: [b.ev.seq], note: bad.length ? `Off-WPS: ${bad.join(', ')}` : undefined };
    },
  },
  {
    id: 'order',
    competency: 'knowledge',
    label: 'Task sequence respected: clean → fit-up check → clamp → tack → weld → inspect',
    sop: 'SOP-WLD §1.2 Work sequence',
    weight: 1,
    check: (c) => {
      const first = (t: string) => c.timeline.find((s) => s.ev.type === t)?.ev.seq ?? Infinity;
      const order = ['clean', 'measure_gap', 'clamp', 'tack', 'arc_start', 'inspect_tool'].map(first);
      const present = order.filter((v) => v !== Infinity);
      const ok = present.every((v, i) => i === 0 || v > present[i - 1]) && order[4] !== Infinity;
      return { passed: ok, evidence: present, note: ok ? undefined : 'Steps performed out of sequence or missing' };
    },
  },
];

const practical: Criterion<WelderState>[] = [
  {
    id: 'coverage',
    competency: 'practical',
    label: 'Seam welded over its full length',
    sop: 'SOP-WLD §5.1 Complete joint length',
    weight: 2,
    check: (c) => {
      const done = c.final.segs.filter(Boolean).length;
      return { passed: done >= SEGMENTS * 0.95, evidence: evidenceOf(c.events, 'arc_stop', 'finish_weld'), note: `${done}/${SEGMENTS} segments deposited` };
    },
  },
  {
    id: 'speed',
    competency: 'practical',
    label: 'Travel speed within the WPS range for ≥ 80 % of the bead',
    sop: 'SOP-WLD §5.2 Travel speed control',
    weight: 2,
    check: (c) => {
      const w = wps(c);
      const segs = c.final.segs.filter(Boolean) as { speed: number }[];
      if (!segs.length) return { passed: false, evidence: [] };
      const ok = segs.filter((s) => s.speed >= w.speedMin && s.speed <= w.speedMax).length;
      return { passed: ok / segs.length >= 0.8, evidence: evidenceOf(c.events, 'bead').slice(0, 3), note: `${Math.round((ok / segs.length) * 100)} % of bead in range` };
    },
  },
  {
    id: 'quality',
    competency: 'practical',
    label: 'Bead free of defects over ≥ 85 % of its length (simulated)',
    sop: 'SOP-WLD §5.3 Visual quality of deposit',
    weight: 3,
    check: (c) => {
      const segs = c.final.segs.filter(Boolean) as { defect: DefectType }[];
      if (!segs.length) return { passed: false, evidence: [] };
      const good = segs.filter((s) => s.defect === 'none').length;
      const counts = segs.reduce<Record<string, number>>((m, s) => ((m[s.defect] = (m[s.defect] ?? 0) + 1), m), {});
      const bad = Object.entries(counts).filter(([k]) => k !== 'none').map(([k, v]) => `${DEFECT_LABEL[k as DefectType]} ×${v}`);
      return { passed: good / SEGMENTS >= 0.85, evidence: evidenceOf(c.events, 'bead').slice(0, 3), note: bad.length ? `Deposited defects: ${bad.join(', ')}` : undefined };
    },
  },
  {
    id: 'no_burn',
    competency: 'practical',
    label: 'No burn-through (heat input controlled)',
    sop: 'SOP-WLD §5.4 Heat input within limits',
    weight: 1,
    check: (c) => {
      const burn = c.final.segs.filter((s) => s?.defect === 'burnThrough').length;
      return { passed: burn === 0, evidence: evidenceOf(c.events, 'bead').slice(0, 3), note: burn ? `${burn} segment(s) burned through` : undefined };
    },
  },
];

const defects: Criterion<WelderState>[] = [
  {
    id: 'found',
    competency: 'defects',
    label: 'Defect locations identified (≥ 2/3 of defect clusters flagged)',
    sop: 'SOP-WLD §6.1 Locate all imperfections',
    weight: 2,
    check: (c) => {
      const cl = defectClusters(c.final.segs);
      if (!cl.length) return { passed: true, evidence: [], note: 'No defects present to find' };
      const found = cl.filter((k) => c.final.flags.some((f) => f.seg >= k.from - 1 && f.seg <= k.to + 1));
      return {
        passed: found.length / cl.length >= 0.66,
        evidence: evidenceOf(c.events, 'flag'),
        note: `Found ${found.length} of ${cl.length} defect clusters`,
      };
    },
  },
  {
    id: 'types',
    competency: 'defects',
    label: 'Defect types named correctly',
    sop: 'SOP-WLD §6.2 Classify imperfections',
    weight: 1,
    check: (c) => {
      const cl = defectClusters(c.final.segs);
      if (!cl.length) return { passed: true, evidence: [] };
      let right = 0,
        total = 0;
      for (const f of c.final.flags) {
        const k = cl.find((x) => f.seg >= x.from - 1 && f.seg <= x.to + 1);
        if (!k) continue;
        total += 1;
        if (k.type === f.type) right += 1;
      }
      if (!total) return { passed: false, evidence: [], note: 'No located flags to classify' };
      return { passed: right / total >= 0.8, evidence: evidenceOf(c.events, 'flag'), note: `${right}/${total} classified correctly` };
    },
  },
  {
    id: 'false_flags',
    competency: 'defects',
    label: 'No false defect flags on sound weld metal',
    sop: 'SOP-WLD §6.3 No unnecessary rejection',
    weight: 1,
    check: (c) => {
      const cl = defectClusters(c.final.segs);
      const fa = c.final.flags.filter((f) => !cl.some((x) => f.seg >= x.from - 1 && f.seg <= x.to + 1));
      return { passed: fa.length === 0, evidence: evidenceOf(c.events, 'flag'), note: fa.length ? `${fa.length} false flag(s)` : undefined };
    },
  },
];

const inspection: Criterion<WelderState>[] = [
  {
    id: 'tool_used',
    competency: 'inspection',
    label: 'Inspection tool (weld gauge / magnifier) used',
    sop: 'SOP-WLD §7.1 Visual inspection with gauge',
    weight: 1,
    check: (c) => ({ passed: c.final.inspectTool !== null, evidence: evidenceOf(c.events, 'inspect_tool') }),
  },
  {
    id: 'after_weld',
    competency: 'inspection',
    label: 'Inspection carried out on the completed weld',
    sop: 'SOP-WLD §7.2 Inspect after completion',
    weight: 1,
    check: (c) => {
      const t = c.timeline.find((s) => s.ev.type === 'inspect_tool');
      if (!t) return { passed: false, evidence: [] };
      return { passed: t.before.weldDone, evidence: [t.ev.seq] };
    },
  },
  {
    id: 'verdict',
    competency: 'inspection',
    label: 'Accept / reject decision is correct for the acceptance criteria',
    sop: 'SOP-WLD §7.3 Accept / reject per acceptance table',
    weight: 2,
    check: (c) => {
      if (!c.final.verdict) return { passed: null, evidence: [], note: 'No verdict recorded' };
      const should = shouldReject(c.final.segs) ? 'reject' : 'accept';
      return { passed: c.final.verdict === should, evidence: evidenceOf(c.events, 'verdict'), note: `Candidate: ${c.final.verdict} · expected: ${should}` };
    },
  },
];

// ─────────── questions ───────────
const qHelmet: Question = {
  id: 'q-helmet',
  topic: 'Arc radiation',
  spoken: 'Why must the helmet be in place before you strike the arc?',
  options: [
    { id: 'a', correct: false, text: 'It keeps sparks out of your hair; the light itself is harmless.' },
    { id: 'b', correct: true, text: 'The arc emits UV and infrared radiation that burns eyes and skin within seconds; the filter lens protects against it.' },
    { id: 'c', correct: false, text: 'It is only needed when welding thick plate.' },
  ],
  rationale: 'Arc radiation causes arc-eye and skin burns; protection is required for every arc strike.',
};
const qGas: Question = {
  id: 'q-gas',
  topic: 'Shielding gas',
  spoken: 'What happens to the weld if the shielding gas is lost or too low during welding?',
  options: [
    { id: 'a', correct: true, text: 'Air contaminates the molten pool, causing porosity and a weak weld.' },
    { id: 'b', correct: false, text: 'Nothing; the gas only keeps the nozzle cool.' },
    { id: 'c', correct: false, text: 'The weld gets stronger because it cools faster.' },
  ],
  rationale: 'Shielding gas displaces atmosphere; losing it entrains oxygen and nitrogen causing porosity.',
};
const qWps: Question = {
  id: 'q-wps',
  topic: 'Heat input',
  spoken: 'Why do you follow the current and travel speed set in the work instruction?',
  options: [
    { id: 'a', correct: false, text: 'Only so the weld looks neat.' },
    { id: 'b', correct: true, text: 'They control heat input: too cold gives lack of fusion, too hot gives undercut or burn-through.' },
    { id: 'c', correct: false, text: 'Because the machine will not run at other settings.' },
  ],
  rationale: 'Heat input governs fusion and distortion; the WPS sets a qualified window.',
};
const qFlam: Question = {
  id: 'q-flam',
  topic: 'Fire prevention',
  spoken: 'Why remove flammable items and check the extinguisher before you weld?',
  options: [
    { id: 'a', correct: false, text: 'Only because the supervisor requires paperwork.' },
    { id: 'b', correct: true, text: 'Sparks and spatter can travel several metres and ignite materials; an extinguisher must be at hand.' },
    { id: 'c', correct: false, text: 'Spatter is cold and cannot start a fire.' },
  ],
  rationale: 'Hot work fires start from spatter far from the arc; clear the area and keep fire watch.',
};
const qPor: Question = {
  id: 'q-por',
  topic: 'Defect response',
  spoken: 'You find clustered porosity along the weld. What is the correct action?',
  options: [
    { id: 'a', correct: false, text: 'Accept it; small holes are cosmetic.' },
    { id: 'b', correct: true, text: 'Reject, grind out the defective length, reweld to the WPS and reinspect.' },
    { id: 'c', correct: false, text: 'Paint over it so it is not visible.' },
  ],
  rationale: 'Porosity beyond the acceptance level must be removed and repaired, then reinspected.',
};
const qLof: Question = {
  id: 'q-lof',
  topic: 'Defect severity',
  spoken: 'Why is lack of fusion treated as more serious than a little surface spatter?',
  options: [
    { id: 'a', correct: true, text: 'The bead is not bonded to the base metal, so it can fail under load even if it looks acceptable.' },
    { id: 'b', correct: false, text: 'It is not; both are purely cosmetic.' },
    { id: 'c', correct: false, text: 'Because it makes the weld look wider.' },
  ],
  rationale: 'Lack of fusion is a planar defect that reduces load-carrying section.',
};

const base = {
  trade: 'welder' as const,
  version: 'v1.0',
  rubricVersion: 'SOP-WLD rev A · weights v0.1 (discovery)',
};

const mild3: WelderParams['wps'] = {
  wire: 'er70s6',
  gas: 'arco2',
  preset: 'p140',
  flowMin: 12,
  flowMax: 16,
  angleMin: 10,
  angleMax: 15,
  speedMin: 4,
  speedMax: 8,
  gapMin: 1,
  gapMax: 3,
};

const fullRequired = (c: Ctx): string[] => {
  const miss: string[] = [];
  if (!c.final.weldDone) miss.push('Weld not completed');
  if (c.final.segs.filter(Boolean).length < SEGMENTS * 0.9) miss.push('Seam less than 90 % deposited');
  if (!c.final.verdict) miss.push('No accept / reject verdict recorded');
  if (!c.final.submitted) miss.push('Attempt was not submitted');
  return miss;
};

const seed = (map: Record<number, DefectType>): DefectType[] =>
  Array.from({ length: SEGMENTS }, (_, i) => map[i] ?? 'none');

export const WELDER_SCENARIOS: Scenario<WelderParams>[] = [
  {
    ...base,
    id: 'wld-1',
    title: 'Flat butt weld, 3 mm mild steel (GMAW)',
    short: 'Prepare, tack and weld a square-edge butt joint in the flat position, then inspect and decide accept / reject.',
    sopRef: 'SOP-WLD-01 · GMAW butt joint, 3 mm mild steel, 1G',
    difficulty: 'Baseline',
    focus: 'PPE & hot-work safety, settings per WPS, joint prep, bead technique, inspection',
    spec: [
      { label: 'Process', value: 'GMAW (MIG) · Mild steel · 3 mm' },
      { label: 'Joint / position', value: 'Square butt · 1G flat' },
      { label: 'WPS wire / gas', value: 'ER70S-6 0.9 mm · Ar/CO₂ 80/20' },
      { label: 'WPS current', value: '140 A / 19 V · torch angle 10–15° (push)' },
      { label: 'WPS flow / speed', value: '12–16 L/min · 4–8 mm/s · gap 1–3 mm' },
      { label: 'Acceptance', value: 'Reject if lack of fusion, burn-through, or ≥ 2 defect zones' },
    ],
    briefing: [
      'Welcome. I am your assessment interviewer. I cannot give hints during the assessment.',
      'Your task: weld a three millimetre mild steel butt joint in the flat position using the MIG process, following the work instruction on screen. Prepare the area and the joint, set up the machine, tack and weld the seam, then inspect the weld.',
      'When you have inspected the weld, record an accept or reject decision and press Submit.',
    ],
    scope: ['safety', 'equip', 'knowledge', 'practical', 'defects', 'inspection'],
    criteria: [...safety, ...equip, ...knowledgeRules, ...practical, ...defects, ...inspection],
    questions: [qHelmet, qGas, qWps],
    params: {
      mode: 'full',
      joint: 'butt',
      thickness: 3,
      wps: mild3,
      fitGap: 2,
      flammables: ['rags', 'solvent'],
      acceptance: 'Reject if lack of fusion, burn-through, or two or more defect zones.',
    },
    required: fullRequired,
  },
  {
    ...base,
    id: 'wld-2',
    title: 'Fillet weld, 6 mm mild steel (GMAW)',
    short: 'T-joint fillet weld on thicker plate – higher current and different torch angle than the baseline.',
    sopRef: 'SOP-WLD-02 · GMAW fillet joint, 6 mm mild steel, 1F',
    difficulty: 'Intermediate',
    focus: 'Parameter selection for thicker plate, fillet technique, heat input control',
    spec: [
      { label: 'Process', value: 'GMAW (MIG) · Mild steel · 6 mm' },
      { label: 'Joint / position', value: 'T-fillet · 1F flat' },
      { label: 'WPS wire / gas', value: 'ER70S-6 0.9 mm · Ar/CO₂ 80/20' },
      { label: 'WPS current', value: '200 A / 22 V · torch angle 40–50° (work angle)' },
      { label: 'WPS flow / speed', value: '12–16 L/min · 3.5–6.5 mm/s · gap 0–2 mm' },
      { label: 'Acceptance', value: 'Reject if lack of fusion, burn-through, or ≥ 2 defect zones' },
    ],
    briefing: [
      'Welcome. I am your assessment interviewer. I cannot give hints during the assessment.',
      'Your task: make a fillet weld on six millimetre mild steel in the flat position, following the work instruction. Note that the plate is thicker than the baseline coupon, so check the instruction carefully before setting up.',
      'Inspect the weld, record an accept or reject decision, then press Submit.',
    ],
    scope: ['safety', 'equip', 'knowledge', 'practical', 'defects', 'inspection'],
    criteria: [...safety, ...equip, ...knowledgeRules, ...practical, ...defects, ...inspection],
    questions: [qFlam, qWps, qPor],
    params: {
      mode: 'full',
      joint: 'fillet',
      thickness: 6,
      wps: { ...mild3, preset: 'p200', angleMin: 40, angleMax: 50, speedMin: 3.5, speedMax: 6.5, gapMin: 0, gapMax: 2 },
      fitGap: 1,
      flammables: ['rags', 'cardboard'],
      acceptance: 'Reject if lack of fusion, burn-through, or two or more defect zones.',
    },
    required: fullRequired,
  },
  {
    ...base,
    id: 'wld-3',
    title: 'Weld inspection and defect identification',
    short: 'Visually inspect a finished coupon, locate and classify the defects, and make the accept / reject decision.',
    sopRef: 'SOP-WLD-03 · Visual inspection of GMAW butt welds',
    difficulty: 'Focused',
    focus: 'Defect identification, classification, acceptance decision (practical execution not in scope)',
    spec: [
      { label: 'Item', value: 'Pre-welded 3 mm butt coupon (GMAW)' },
      { label: 'Task', value: 'Inspect · flag defects with type · accept / reject' },
      { label: 'Tools', value: 'Weld gauge, magnifier' },
      { label: 'Acceptance', value: 'Reject if lack of fusion, burn-through, or ≥ 2 defect zones' },
    ],
    briefing: [
      'Welcome. I am your assessment interviewer. I cannot give hints during the assessment.',
      'Your task: inspect this finished three millimetre butt weld. Use an inspection tool, mark every defect you find along the seam and name its type, then record an accept or reject decision.',
      'You do not need to weld in this scenario. Press Submit when you are finished.',
    ],
    scope: ['safety', 'defects', 'inspection'],
    criteria: [...inspectSafety, ...defects, ...inspection],
    questions: [qPor, qLof, qWps],
    params: {
      mode: 'inspect',
      joint: 'butt',
      thickness: 3,
      wps: mild3,
      fitGap: 2,
      flammables: [],
      preWelded: seed({ 5: 'porosity', 6: 'porosity', 7: 'porosity', 13: 'undercut', 14: 'undercut', 19: 'lackFusion' }),
      acceptance: 'Reject if lack of fusion, burn-through, or two or more defect zones.',
    },
    required: (c) => {
      const miss: string[] = [];
      if (!c.final.inspectTool) miss.push('No inspection tool used');
      if (!c.final.verdict) miss.push('No accept / reject verdict recorded');
      if (!c.final.submitted) miss.push('Attempt was not submitted');
      return miss;
    },
  },
];
