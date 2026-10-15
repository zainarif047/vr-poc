import type { Competency, Criterion, EvalContext, Question, Scenario } from '../types';
import { evidenceOf, seqs } from '../helpers';
import { IDS, part, pipeId } from './catalog';
import type { SlotDef } from './layout';
import { type PlumberParams, type PlumberState, WORK_EVENTS } from './reducer';

// Competency groups + weights: AZIZ plumber matrix, used as discovery inputs (proposal §4.5).
export const PLUMBER_COMPETENCIES: Competency[] = [
  { id: 'safety', label: 'Safety and preparation', weight: 20 },
  { id: 'tools', label: 'Tools and materials', weight: 10 },
  { id: 'measure', label: 'Measurement and planning', weight: 10 },
  { id: 'practical', label: 'Practical installation', weight: 30 },
  { id: 'diagnosis', label: 'Diagnosis and problem solving', weight: 15 },
  { id: 'testing', label: 'Testing and quality control', weight: 15 },
];

type Ctx = EvalContext<PlumberState>;
type Step = Ctx['timeline'][number];
const params = (c: Ctx) => c.scenario.params as PlumberParams;
const isWork = (s: Step) => WORK_EVENTS.includes(s.ev.type);

function matchesReq(def: SlotDef, partId: string | null, strictLen = true) {
  if (!partId) return false;
  const p = part(partId);
  return (
    p.kind === def.req.kind &&
    p.material === def.req.material &&
    p.dia === def.req.dia &&
    !p.defective &&
    (!strictLen || def.req.kind !== 'pipe' || p.len === def.req.len)
  );
}

// ───────────────────────── SOP criteria (rule layer) ─────────────────────────
const safety: Criterion<PlumberState>[] = [
  {
    id: 'ppe',
    competency: 'safety',
    label: 'Eye protection and gloves worn before starting work; no unsuitable footwear',
    sop: 'SOP-PLB §2.1 PPE before any pipework activity',
    weight: 1,
    check: (c) => {
      const w = c.timeline.find(isWork);
      if (!w) return { passed: null, evidence: [], note: 'No work action recorded' };
      const ppe = w.before.ppe;
      const ok = ppe.includes('glasses') && ppe.includes('gloves') && !ppe.includes('sandals');
      return {
        passed: ok,
        evidence: [w.ev.seq],
        note: ok ? undefined : `PPE at first work action: ${ppe.join(', ') || 'none'}`,
      };
    },
  },
  {
    id: 'isolate',
    competency: 'safety',
    critical: true,
    label: 'Water supply isolated before any component is fitted, removed or tightened',
    sop: 'SOP-PLB §2.2 Isolate and confirm before work (CRITICAL)',
    weight: 2,
    check: (c) => {
      const work = c.timeline.filter(isWork);
      if (!work.length) return { passed: null, evidence: [] };
      const bad = work.filter((s) => s.before.supply !== 'isolated');
      return {
        passed: bad.length === 0,
        evidence: bad.length ? seqs(bad.map((b) => b.ev)).slice(0, 6) : [work[0].ev.seq],
        note: bad.length ? `${bad.length} work action(s) performed on live, pressurised supply` : undefined,
      };
    },
  },
  {
    id: 'drain',
    competency: 'safety',
    label: 'Line drained / depressurised before first work action',
    sop: 'SOP-PLB §2.3 Drain down and confirm zero pressure',
    weight: 1,
    check: (c) => {
      const w = c.timeline.find(isWork);
      if (!w) return { passed: null, evidence: [] };
      return {
        passed: w.before.drained,
        evidence: [w.ev.seq],
        note: w.before.drained ? undefined : 'Line still held trapped pressure when work started',
      };
    },
  },
];

const tools = (replaceFocus: boolean): Criterion<PlumberState>[] => [
  {
    id: 'tool_choice',
    competency: 'tools',
    label: 'Correct tool used for each task (wrench for compression joints, tape for measuring)',
    sop: 'SOP-PLB §3.1 Approved tool for task',
    weight: 1,
    check: (c) => {
      const bad = c.events.filter((e) => e.type === 'wrong_tool');
      return {
        passed: bad.length === 0,
        evidence: seqs(bad),
        note: bad.length ? `Attempted to tighten/fit using ${[...new Set(bad.map((b) => b.data?.tool))].join(', ')}` : undefined,
      };
    },
  },
  {
    id: 'material_choice',
    competency: 'tools',
    label: replaceFocus
      ? 'Replacement fitting is the correct material, diameter and undamaged'
      : 'Only parts of the specified material and diameter were selected',
    sop: 'SOP-PLB §3.2 Material and diameter per work order',
    weight: 2,
    check: (c) => {
      const defs = params(c).slots;
      const placed = c.timeline.filter((s) => s.ev.type === 'place');
      if (!placed.length) return { passed: null, evidence: [] };
      const bad = placed.filter((s) => {
        const def = defs.find((d) => d.id === s.ev.obj)!;
        const p = part(String(s.ev.data?.part));
        return p.material !== def.req.material || p.dia !== def.req.dia || p.defective;
      });
      return {
        passed: bad.length === 0,
        evidence: seqs(bad.map((b) => b.ev)),
        note: bad.length ? `${bad.length} wrong material/diameter part(s) fitted` : undefined,
      };
    },
  },
];

const measure: Criterion<PlumberState>[] = [
  {
    id: 'measure_first',
    competency: 'measure',
    label: 'Each pipe gap measured before a pipe length was chosen',
    sop: 'SOP-PLB §4.1 Measure twice, fit once',
    weight: 1,
    check: (c) => {
      const pipeSlots = params(c).slots.filter((d) => d.req.kind === 'pipe');
      const bad: number[] = [];
      for (const d of pipeSlots) {
        const m = c.timeline.find((s) => s.ev.type === 'measure' && s.ev.obj === d.id);
        const p = c.timeline.find((s) => s.ev.type === 'place' && s.ev.obj === d.id && part(String(s.ev.data?.part)).kind === 'pipe');
        if (!m) bad.push(p ? p.ev.seq : 0);
        else if (p && p.ev.seq < m.ev.seq) bad.push(p.ev.seq);
      }
      return {
        passed: bad.length === 0,
        evidence: evidenceOf(c.events, 'measure'),
        note: bad.length ? 'At least one pipe was fitted without a prior measurement' : undefined,
      };
    },
  },
  {
    id: 'length_match',
    competency: 'measure',
    label: 'Installed pipe lengths match the measured gaps',
    sop: 'SOP-PLB §4.2 Length within ±0 mm of stocked size',
    weight: 2,
    check: (c) => {
      const defs = params(c).slots.filter((d) => d.req.kind === 'pipe');
      const bad = defs.filter((d) => {
        const sp = c.final.slots[d.id].part;
        return !sp || part(sp).kind !== 'pipe' || part(sp).len !== d.req.len;
      });
      return {
        passed: bad.length === 0,
        evidence: evidenceOf(c.events, 'place').slice(-4),
        note: bad.length ? `Wrong/missing pipe length in ${bad.map((b) => b.label).join(', ')}` : undefined,
      };
    },
  },
];

const practical = (opts: { sequence: boolean }): Criterion<PlumberState>[] => {
  const list: Criterion<PlumberState>[] = [
    {
      id: 'components',
      competency: 'practical',
      label: 'Final run uses the correct component in every position',
      sop: 'SOP-PLB §5.1 Component schedule',
      weight: 3,
      check: (c) => {
        const defs = params(c).slots;
        const bad = defs.filter((d) => !matchesReq(d, c.final.slots[d.id].part));
        return {
          passed: bad.length === 0,
          evidence: evidenceOf(c.events, 'place').slice(-5),
          note: bad.length ? `Incorrect/missing: ${bad.map((b) => b.label).join(', ')}` : undefined,
        };
      },
    },
    {
      id: 'joints',
      competency: 'practical',
      label: 'Every compression joint tightened',
      sop: 'SOP-PLB §5.2 All joints made up and secured',
      weight: 2,
      check: (c) => {
        const defs = params(c).slots;
        const loose = defs.filter((d) => !c.final.slots[d.id].part || !c.final.slots[d.id].tight);
        return {
          passed: loose.length === 0,
          evidence: evidenceOf(c.events, 'tighten').slice(-5),
          note: loose.length ? `Not secured: ${loose.map((l) => l.label).join(', ')}` : undefined,
        };
      },
    },
  ];
  if (opts.sequence)
    list.push({
      id: 'sequence',
      competency: 'practical',
      label: 'Installed in order from the supply side outwards',
      sop: 'SOP-PLB §5.3 Work from supply to outlet',
      weight: 1,
      check: (c) => {
        const defs = params(c).slots.map((d) => d.id);
        const first: string[] = [];
        for (const s of c.timeline) {
          if (s.ev.type === 'place' && !first.includes(String(s.ev.obj))) first.push(String(s.ev.obj));
        }
        const idx = first.map((id) => defs.indexOf(id));
        const ok = idx.every((v, i) => i === 0 || v >= idx[i - 1]);
        return { passed: first.length ? ok : null, evidence: evidenceOf(c.events, 'place').slice(0, 6), note: ok ? undefined : 'Components fitted out of route order' };
      },
    });
  return list;
};

const diagnosis = (faulty: string[]): Criterion<PlumberState>[] => [
  {
    id: 'locate_first',
    competency: 'diagnosis',
    label: 'Fault located with a pressure test before any repair work',
    sop: 'SOP-PLB §6.1 Locate before repair',
    weight: 1,
    check: (c) => {
      const t = c.timeline.find((s) => s.ev.type === 'pressure_test' && s.after.lastTest === 'leak');
      const w = c.timeline.find(isWork);
      if (!t) return { passed: false, evidence: [], note: 'Leak never located by test' };
      return { passed: !w || t.ev.seq < w.ev.seq, evidence: [t.ev.seq] };
    },
  },
  {
    id: 'flag_correct',
    competency: 'diagnosis',
    label: 'Exactly the faulty joints were identified (no false flags)',
    sop: 'SOP-PLB §6.2 Identify defective joints',
    weight: 2,
    check: (c) => {
      const f = [...c.final.flagged].sort();
      const want = [...faulty].sort();
      const ok = f.length === want.length && f.every((v, i) => v === want[i]);
      return {
        passed: ok,
        evidence: evidenceOf(c.events, 'flag_leak'),
        note: ok ? undefined : `Flagged: ${f.join(', ') || 'none'} · actual faults: ${want.join(', ')}`,
      };
    },
  },
  {
    id: 'root_cause',
    competency: 'diagnosis',
    label: 'Root cause repaired (loose joint tightened, cracked fitting replaced – not just re-tightened)',
    sop: 'SOP-PLB §6.3 Repair the cause',
    weight: 2,
    check: (c) => {
      const defs = params(c).slots;
      const bad = faulty.filter((id) => {
        const st = c.final.slots[id];
        const def = defs.find((d) => d.id === id)!;
        return !st.part || !st.tight || part(st.part).defective || !matchesReq(def, st.part);
      });
      return {
        passed: bad.length === 0,
        evidence: evidenceOf(c.events, 'tighten', 'remove', 'place').slice(-6),
        note: bad.length ? `Fault not fully repaired at ${bad.join(', ')}` : undefined,
      };
    },
  },
  {
    id: 'no_collateral',
    competency: 'diagnosis',
    label: 'Healthy components left undisturbed',
    sop: 'SOP-PLB §6.4 Minimum intervention',
    weight: 1,
    check: (c) => {
      const removed = c.timeline.filter((s) => s.ev.type === 'remove' && !faulty.includes(String(s.ev.obj)));
      return {
        passed: removed.length === 0,
        evidence: seqs(removed.map((r) => r.ev)),
        note: removed.length ? 'Healthy fittings were removed unnecessarily' : undefined,
      };
    },
  },
];

const testing: Criterion<PlumberState>[] = [
  {
    id: 'test_run',
    competency: 'testing',
    label: 'Pressure / leak test performed on the finished installation',
    sop: 'SOP-PLB §7.1 Pressure test after completion',
    weight: 2,
    check: (c) => {
      const tests = c.timeline.filter((s) => s.ev.type === 'pressure_test' && ['pass', 'leak'].includes(s.after.lastTest));
      const lastWork = [...c.timeline].reverse().find(isWork);
      if (!tests.length) return { passed: false, evidence: [], note: 'No completed pressure test' };
      const final = tests[tests.length - 1];
      return {
        passed: !lastWork || final.ev.seq > lastWork.ev.seq,
        evidence: [final.ev.seq],
        note: !lastWork || final.ev.seq > lastWork.ev.seq ? undefined : 'Work continued after the last test',
      };
    },
  },
  {
    id: 'test_pass',
    competency: 'testing',
    label: 'Final pressure test passed (no leaks)',
    sop: 'SOP-PLB §7.2 Zero leakage at working pressure',
    weight: 2,
    check: (c) => ({
      passed: c.final.lastTest === 'pass',
      evidence: evidenceOf(c.events, 'pressure_test').slice(-1),
      note: c.final.lastTest === 'pass' ? undefined : `Last test result: ${c.final.lastTest}`,
    }),
  },
  {
    id: 'retest',
    competency: 'testing',
    label: 'Retested after any leak was found',
    sop: 'SOP-PLB §7.3 Retest after remedial work',
    weight: 1,
    check: (c) => {
      const tests = c.timeline.filter((s) => s.ev.type === 'pressure_test' && ['pass', 'leak'].includes(s.after.lastTest));
      const firstLeak = tests.findIndex((s) => s.after.lastTest === 'leak');
      if (firstLeak === -1) return { passed: tests.length ? true : null, evidence: seqs(tests.map((t) => t.ev)) };
      const later = tests.slice(firstLeak + 1);
      return { passed: later.length > 0 && later[later.length - 1].after.lastTest === 'pass', evidence: seqs(tests.map((t) => t.ev)) };
    },
  },
];

// ───────────────────────── Interview questions (knowledge & reasoning) ─────────────────────────
const qIsolation: Question = {
  id: 'q-iso',
  topic: 'Isolation & depressurisation',
  spoken: 'Before you touched the pipework, what did you do about the water supply, and why?',
  options: [
    { id: 'a', correct: true, text: 'Closed the isolation valve and drained the line so no pressurised water was left to spray or flood.' },
    { id: 'b', correct: false, text: 'Left it on – mains pressure is low enough that it is safe to work on.' },
    { id: 'c', correct: false, text: 'Only turned the handle a quarter turn to reduce the flow while I worked.' },
  ],
  rationale: 'SOP requires isolation and drain-down; trapped pressure can still discharge when a joint is broken.',
};
const qTape: Question = {
  id: 'q-tape',
  topic: 'Measurement & planning',
  spoken: 'How did you decide which pipe length to fit in each gap?',
  options: [
    { id: 'a', correct: false, text: 'Picked the longest one so it would definitely reach.' },
    { id: 'b', correct: true, text: 'Measured the gap with the tape and selected the stocked length that matches it.' },
    { id: 'c', correct: false, text: 'Eyeballed it and adjusted by tightening harder.' },
  ],
  rationale: 'SOP requires a measured length; over-tightening cannot compensate for a wrong length.',
};
const qLeak: Question = {
  id: 'q-leak',
  topic: 'Testing & leak response',
  spoken: 'During the pressure test you see a joint weeping. What is your next step?',
  options: [
    { id: 'a', correct: false, text: 'Leave it, small drips stop on their own once the system settles.' },
    { id: 'b', correct: true, text: 'Isolate and depressurise, then re-make or replace the joint, and retest.' },
    { id: 'c', correct: false, text: 'Wrap tape around the outside of the joint and continue.' },
  ],
  rationale: 'Remedial work must be done isolated and followed by a retest of the whole run.',
};
const qDia: Question = {
  id: 'q-dia',
  topic: 'Material & diameter',
  spoken: 'Why does it matter that every fitting matches the pipe diameter and material in the work order?',
  options: [
    { id: 'a', correct: false, text: 'It only matters for appearance.' },
    { id: 'b', correct: true, text: 'A mismatched size or material cannot seal properly and may fail under pressure or contaminate the system.' },
    { id: 'c', correct: false, text: 'It does not matter as long as the nut is tight.' },
  ],
  rationale: 'Compression joints seal only on the correct olive/diameter; mixed materials risk failure.',
};
const qCrack: Question = {
  id: 'q-crack',
  topic: 'Diagnosis reasoning',
  spoken: 'One fitting was leaking even after it was tight. What does that tell you and what do you do?',
  options: [
    { id: 'a', correct: true, text: 'The body is damaged – tightening will not cure it, so it must be replaced.' },
    { id: 'b', correct: false, text: 'Tighten it a bit more with a hammer.' },
    { id: 'c', correct: false, text: 'Seal the crack with jointing compound and keep the fitting.' },
  ],
  rationale: 'A cracked body cannot be repaired; replace the component.',
};
const qWhy: Question = {
  id: 'q-why',
  topic: 'Diagnosis approach',
  spoken: 'Why did you run the pressure test before taking anything apart?',
  options: [
    { id: 'a', correct: false, text: 'It is quicker to just replace every joint.' },
    { id: 'b', correct: true, text: 'To locate exactly which joints leak so I only repair the faulty ones.' },
    { id: 'c', correct: false, text: 'To check the gauge is working.' },
  ],
  rationale: 'Locate first, then repair with minimum intervention.',
};

// ───────────────────────── Scenario library ─────────────────────────
const copper15 = (kind: SlotDef['kind'], len?: number) => ({ kind, material: 'copper' as const, dia: 15 as const, len });
const copper22 = (kind: SlotDef['kind'], len?: number) => ({ kind, material: 'copper' as const, dia: 22 as const, len });

const p1Slots: SlotDef[] = [
  { id: 's1', label: 'Slot 1 · Isolation valve', kind: 'valve', req: copper15('valve') },
  { id: 's2', label: 'Slot 2 · Straight run', kind: 'pipe', len: 250, req: copper15('pipe', 250) },
  { id: 's3', label: 'Slot 3 · Elbow', kind: 'elbow', turn: 'L', req: copper15('elbow') },
  { id: 's4', label: 'Slot 4 · Riser to outlet', kind: 'pipe', len: 200, req: copper15('pipe', 200) },
];
const p2Slots: SlotDef[] = [
  { id: 's1', label: 'Slot 1 · Isolation valve', kind: 'valve', req: copper22('valve') },
  { id: 's2', label: 'Slot 2 · Feed pipe', kind: 'pipe', len: 150, req: copper22('pipe', 150) },
  { id: 's3', label: 'Slot 3 · Tee', kind: 'tee', branch: 'L', req: copper22('tee') },
  { id: 's4', label: 'Slot 4 · Run to outlet', kind: 'pipe', len: 300, req: copper22('pipe', 300) },
  { id: 's5', label: 'Slot 5 · Branch cap', kind: 'cap', from: 's3', req: copper22('cap') },
];
const p3Slots: SlotDef[] = [
  { id: 's1', label: 'Joint 1 · Isolation valve', kind: 'valve', req: copper15('valve') },
  { id: 's2', label: 'Joint 2 · Straight run', kind: 'pipe', len: 200, req: copper15('pipe', 200) },
  { id: 's3', label: 'Joint 3 · Elbow', kind: 'elbow', turn: 'L', req: copper15('elbow') },
  { id: 's4', label: 'Joint 4 · Riser to outlet', kind: 'pipe', len: 200, req: copper15('pipe', 200) },
];

const trayP1 = [
  IDS.valve15, IDS.valve22,
  pipeId(15, 150), pipeId(15, 200), pipeId(15, 250), pipeId(15, 300), pipeId(15, 350), IDS.pvcPipe15_250, pipeId(22, 200),
  IDS.elbow15, IDS.elbow22, IDS.elbowPvc15, IDS.tee15, IDS.cap15,
];
const trayP2 = [
  IDS.valve22, IDS.valve15,
  pipeId(22, 150), pipeId(22, 200), pipeId(22, 300), pipeId(22, 350), IDS.galvPipe22_300, pipeId(15, 150), pipeId(15, 300),
  IDS.tee22, IDS.tee15, IDS.cap22, IDS.cap15, IDS.elbow22,
];
const trayP3 = [
  IDS.valve15,
  pipeId(15, 150), pipeId(15, 200), pipeId(15, 250), pipeId(22, 200),
  IDS.elbow15, IDS.elbow22, IDS.elbowPvc15, IDS.tee15, IDS.cap15,
];

const base = {
  trade: 'plumber' as const,
  version: 'v1.0',
  rubricVersion: 'SOP-PLB rev A · weights v0.1 (discovery)',
};

export const PLUMBER_SCENARIOS: Scenario<PlumberParams>[] = [
  {
    ...base,
    id: 'plb-1',
    title: 'Valve and riser installation',
    short: 'Install an isolation valve, straight run, elbow and riser to the basin outlet, then pressure test.',
    sopRef: 'SOP-PLB-01 · Compression joint installation, 15 mm copper',
    difficulty: 'Baseline',
    focus: 'Isolation, measurement, material selection, joint make-up, pressure test',
    spec: [
      { label: 'Material', value: 'Copper 15 mm, compression fittings' },
      { label: 'Working pressure', value: '3 bar (mains)' },
      { label: 'Scope', value: 'Valve → straight run → elbow → riser to outlet' },
      { label: 'Standard', value: 'No leaks at 3 bar' },
    ],
    briefing: [
      'Welcome. I am your assessment interviewer. I will assign one task, observe your work, and ask a few questions afterwards. I cannot give hints during the assessment.',
      'Your task: install a 15 millimetre copper supply line from the wall stub to the basin outlet. Fit an isolation valve at the supply end, a straight run, an elbow, and a riser. Use compression fittings.',
      'The system is live at three bar. Complete the installation, test it, then press Submit when you are finished.',
    ],
    scope: ['safety', 'tools', 'measure', 'practical', 'testing'],
    criteria: [...safety, ...tools(false), ...measure, ...practical({ sequence: true }), ...testing],
    questions: [qIsolation, qTape, qLeak],
    params: { slots: p1Slots, tray: trayP1, startSupply: 'open', mainsBar: 3, outletLabel: 'Basin outlet' },
    required: (c) => {
      const miss: string[] = [];
      const defs = (c.scenario.params as PlumberParams).slots;
      if (defs.some((d) => !c.final.slots[d.id].part)) miss.push('Installation not complete (empty positions)');
      if (!c.final.testCount) miss.push('No completed pressure test');
      if (!c.final.submitted) miss.push('Attempt was not submitted');
      return miss;
    },
  },
  {
    ...base,
    id: 'plb-2',
    title: 'Branch line with tee and capped stub',
    short: 'Install a 22 mm main with a tee, capped branch stub and run to the outlet.',
    sopRef: 'SOP-PLB-02 · Branch connection, 22 mm copper',
    difficulty: 'Intermediate',
    focus: 'Diameter selection (22 mm), tee/cap choice, sequencing, measurement',
    spec: [
      { label: 'Material', value: 'Copper 22 mm, compression fittings' },
      { label: 'Working pressure', value: '3 bar (mains)' },
      { label: 'Scope', value: 'Valve → feed → tee (capped branch) → run to outlet' },
      { label: 'Standard', value: 'No leaks at 3 bar, branch blanked' },
    ],
    briefing: [
      'Welcome. I am your assessment interviewer. I cannot give hints during the assessment.',
      'Your task: install a 22 millimetre copper main with an isolation valve, a feed pipe, a tee, and a straight run to the outlet. The tee branch must be blanked with a cap for a future connection.',
      'The system is live at three bar. Complete the installation, test it, then press Submit.',
    ],
    scope: ['safety', 'tools', 'measure', 'practical', 'testing'],
    criteria: [...safety, ...tools(false), ...measure, ...practical({ sequence: true }), ...testing],
    questions: [qIsolation, qDia, qLeak],
    params: { slots: p2Slots, tray: trayP2, startSupply: 'open', mainsBar: 3, outletLabel: 'Outlet' },
    required: (c) => {
      const miss: string[] = [];
      const defs = (c.scenario.params as PlumberParams).slots;
      if (defs.some((d) => !c.final.slots[d.id].part)) miss.push('Installation not complete (empty positions)');
      if (!c.final.testCount) miss.push('No completed pressure test');
      if (!c.final.submitted) miss.push('Attempt was not submitted');
      return miss;
    },
  },
  {
    ...base,
    id: 'plb-3',
    title: 'Leak diagnosis and repair',
    short: 'A customer reports a leak on an installed run. Locate the faults, repair them safely and retest.',
    sopRef: 'SOP-PLB-03 · Fault diagnosis and remedial work, 15 mm copper',
    difficulty: 'Advanced',
    focus: 'Diagnosis, root-cause repair, minimum intervention, retest',
    spec: [
      { label: 'Material', value: 'Copper 15 mm, compression fittings' },
      { label: 'Condition', value: 'Installed run, live at 3 bar, customer reports leaking' },
      { label: 'Scope', value: 'Find faults · repair · retest. Do not rebuild healthy parts.' },
      { label: 'Standard', value: 'No leaks at 3 bar' },
    ],
    briefing: [
      'Welcome. I am your assessment interviewer. I cannot give hints during the assessment.',
      'Your task: a customer has reported a leak on this installed fifteen millimetre copper run. The system is live. Find the fault or faults, repair them safely, and prove the repair with a test.',
      'You may mark leaking joints using the leak marker. Press Submit when you are finished.',
    ],
    scope: ['safety', 'tools', 'practical', 'diagnosis', 'testing'],
    criteria: [...safety, ...tools(true), ...practical({ sequence: false }), ...diagnosis(['s2', 's3']), ...testing],
    questions: [qWhy, qCrack, qIsolation],
    params: {
      slots: p3Slots,
      tray: trayP3,
      startSupply: 'open',
      mainsBar: 3,
      outletLabel: 'Basin outlet',
      faultySlots: ['s2', 's3'],
      initial: {
        s1: { part: IDS.valve15, tight: true },
        s2: { part: pipeId(15, 200), tight: false },
        s3: { part: IDS.elbowCracked15, tight: true },
        s4: { part: pipeId(15, 200), tight: true },
      },
    },
    required: (c) => {
      const miss: string[] = [];
      if (!c.final.testCount) miss.push('No completed pressure test');
      if (!c.final.submitted) miss.push('Attempt was not submitted');
      return miss;
    },
  },
];
