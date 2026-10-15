import type { ActionEvent, Answer, EvidenceMeta, Outcome, Scenario } from './types';
import { SCENARIOS, scenarioById } from './index';
import { IDS, pipeId } from './plumber/catalog';
import type { PlumberParams } from './plumber/reducer';
import { SEGMENTS, type WelderParams } from './welder/reducer';

/** Scripted candidate attempts used by the Validation Lab and unit tests. */
export interface LabAttempt {
  id: string;
  scenarioId: string;
  name: string;
  why: string; // what SOP behaviour this attempt is designed to exercise
  expect: { outcome: Outcome; critical?: string[]; notCritical?: boolean };
  events: ActionEvent[];
  answers: Answer[];
  meta?: EvidenceMeta;
}

class Rec {
  events: ActionEvent[] = [];
  t = 3000;
  e(type: string, obj?: string, data?: Record<string, string | number | boolean>, dt = 1400) {
    this.t += dt;
    this.events.push({ seq: this.events.length + 1, t: this.t, type, obj, data });
    return this;
  }
}

function answers(scn: Scenario, correct: number | 'unsure'): Answer[] {
  return scn.questions.map((q, i) => {
    let optionId: string;
    if (correct === 'unsure') optionId = i === 0 ? 'unsure' : q.options.find((o) => o.correct)!.id;
    else optionId = i < correct ? q.options.find((o) => o.correct)!.id : q.options.find((o) => !o.correct)!.id;
    return { qid: q.id, optionId, t: 600000 + i * 9000 };
  });
}

const failedRecording: EvidenceMeta = { recording: 'failed', transcript: [] };

// ───────────────────────── plumber scripts ─────────────────────────
function plumberCorrectParts(scn: Scenario<PlumberParams>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of scn.params.slots) {
    const r = d.req;
    out[d.id] =
      r.kind === 'pipe'
        ? pipeId(r.dia, r.len!)
        : ({
            valve: r.dia === 15 ? IDS.valve15 : IDS.valve22,
            elbow: r.dia === 15 ? IDS.elbow15 : IDS.elbow22,
            tee: r.dia === 15 ? IDS.tee15 : IDS.tee22,
            cap: r.dia === 15 ? IDS.cap15 : IDS.cap22,
          } as Record<string, string>)[r.kind];
  }
  return out;
}

function plumberInstall(r: Rec, scn: Scenario<PlumberParams>, o: { safe?: boolean; measure?: boolean; drain?: boolean; ppe?: boolean } = {}) {
  const { safe = true, measure = true, drain = true, ppe = true } = o;
  const parts = plumberCorrectParts(scn);
  const defs = scn.params.slots;
  if (ppe) r.e('ppe', undefined, { item: 'glasses', on: true }).e('ppe', undefined, { item: 'gloves', on: true });
  if (safe) {
    r.e('isolate');
    if (drain) r.e('drain');
  }
  if (measure) {
    r.e('tool', undefined, { tool: 'tape' });
    defs.filter((d) => d.req.kind === 'pipe').forEach((d) => r.e('measure', d.id, { mm: d.req.len! }));
  }
  r.e('tool', undefined, { tool: 'hand' });
  defs.forEach((d) => r.e('place', d.id, { part: parts[d.id] }));
  r.e('tool', undefined, { tool: 'wrench' });
  defs.forEach((d) => r.e('tighten', d.id));
  r.e('restore').e('pressure_test').e('submit');
  return r;
}

function plumberRepair(r: Rec, o: { live?: boolean; replace?: boolean; flagOk?: boolean; locate?: boolean } = {}) {
  const { live = false, replace = true, flagOk = true, locate = true } = o;
  r.e('ppe', undefined, { item: 'glasses', on: true }).e('ppe', undefined, { item: 'gloves', on: true });
  if (locate) r.e('pressure_test'); // supply starts open → test reveals leaks
  r.e('tool', undefined, { tool: 'marker' });
  if (flagOk) r.e('flag_leak', 's2').e('flag_leak', 's3');
  else r.e('flag_leak', 's1');
  if (!live) r.e('isolate').e('drain');
  r.e('tool', undefined, { tool: 'wrench' }).e('tighten', 's2');
  if (replace) {
    r.e('tool', undefined, { tool: 'hand' }).e('remove', 's3').e('place', 's3', { part: IDS.elbow15 });
    r.e('tool', undefined, { tool: 'wrench' }).e('tighten', 's3');
  } else {
    r.e('tighten', 's3');
  }
  r.e('restore').e('pressure_test').e('submit');
  return r;
}

function plumberAttempts(scn: Scenario<PlumberParams>): LabAttempt[] {
  const sid = scn.id;
  const isDiag = sid === 'plb-3';
  const A = (id: string, name: string, why: string, expect: LabAttempt['expect'], r: Rec, ans: Answer[], meta?: EvidenceMeta): LabAttempt => ({
    id: `${sid}:${id}`,
    scenarioId: sid,
    name,
    why,
    expect,
    events: r.events,
    answers: ans,
    meta,
  });
  const out: LabAttempt[] = [];

  const expertRec = () => (isDiag ? plumberRepair(new Rec()) : plumberInstall(new Rec(), scn));
  out.push(A('expert', 'Expert run (reference)', 'Full SOP compliance: PPE, isolate, drain, measure, correct parts, tighten, test.', { outcome: 'Qualified', notCritical: true }, expertRec(), answers(scn, 3)));

  out.push(
    A(
      'unsafe',
      'Works on the live, pressurised supply',
      'SOP §2.2: any fit/remove/tighten with the supply open is a critical error that overrides the score.',
      { outcome: 'Not Qualified', critical: ['isolate'] },
      isDiag ? plumberRepair(new Rec(), { live: true }) : plumberInstall(new Rec(), scn, { safe: false }),
      answers(scn, 3),
    ),
  );

  out.push(
    A(
      'weak-reasoning',
      'Good hands, weak reasoning',
      'Practical result passes but knowledge/reasoning score is below threshold → Conditionally Qualified (separate scores).',
      { outcome: 'Conditionally Qualified', notCritical: true },
      expertRec(),
      answers(scn, 1),
    ),
  );

  if (isDiag) {
    const r = new Rec();
    r.e('isolate').e('tool', undefined, { tool: 'wrench' }).e('tighten', 's1').e('tighten', 's2').e('tighten', 's3').e('tighten', 's4');
    r.e('tool', undefined, { tool: 'hand' }).e('remove', 's1').e('place', 's1', { part: IDS.valve15 }).e('tool', undefined, { tool: 'wrench' }).e('tighten', 's1');
    r.e('restore').e('pressure_test').e('submit');
    out.push(
      A(
        'shotgun',
        'Re-tightens everything, never replaces the cracked fitting',
        'SOP §6.3/6.4: root cause not repaired and a healthy part disturbed; no PPE or drain; retest still leaks.',
        { outcome: 'Not Qualified', notCritical: true },
        r,
        answers(scn, 1),
      ),
    );
  } else {
    const r = new Rec();
    const defs = scn.params.slots;
    r.e('isolate');
    defs.forEach((d) => {
      const wrong =
        d.req.kind === 'pipe' ? IDS.pvcPipe15_250 : d.req.kind === 'valve' ? (d.req.dia === 15 ? IDS.valve22 : IDS.valve15) : d.req.kind === 'elbow' ? IDS.elbowPvc15 : d.req.kind === 'tee' ? IDS.tee15 : IDS.cap15;
      r.e('place', d.id, { part: wrong });
    });
    r.e('tool', undefined, { tool: 'wrench' }).e('tighten', defs[0].id).e('restore').e('pressure_test').e('submit');
    out.push(
      A(
        'poor',
        'Wrong parts, no PPE/measurement, one joint left loose',
        'Isolated, but wrong material/diameter, no PPE, no drain, unmeasured, joints not secured → fails by thresholds without a critical flag.',
        { outcome: 'Not Qualified', notCritical: true },
        r,
        answers(scn, 1),
      ),
    );
  }

  {
    const r = new Rec();
    r.e('ppe', undefined, { item: 'glasses', on: true }).e('ppe', undefined, { item: 'gloves', on: true }).e('isolate').e('drain');
    r.e('place', 's1', { part: plumberCorrectParts(scn).s1 }).e('tool', undefined, { tool: 'wrench' }).e('tighten', 's1');
    out.push(
      A(
        'incomplete',
        'Stops half-way and walks away',
        'Proposal §4.5: incomplete attempts must be held for review, never silently passed or failed.',
        { outcome: 'Pending Review' },
        r,
        [],
      ),
    );
  }

  {
    const full = expertRec();
    const kept = full.events.filter((e) => e.seq < 5 || e.seq > 8); // drop 4 events → seq gap
    out.push(
      A(
        'evidence-gap',
        'Event stream with missing actions',
        'Proposal §4.4: missing evidence is surfaced and routed to review rather than treated as success.',
        { outcome: 'Pending Review' },
        { events: kept } as Rec,
        answers(scn, 3),
      ),
    );
  }

  out.push(
    A(
      'recording-failed',
      'Canvas recording failed',
      'Proposal §4.4: recording failure is surfaced; result held for assessor decision.',
      { outcome: 'Pending Review' },
      expertRec(),
      answers(scn, 3),
      failedRecording,
    ),
  );

  {
    const r = isDiag ? plumberRepair(new Rec()) : plumberInstall(new Rec(), scn);
    // inject a hammer strike at the first tighten
    const i = r.events.findIndex((e) => e.type === 'tighten');
    const strike: ActionEvent = { seq: 0, t: r.events[i].t - 200, type: 'wrong_tool', obj: String(r.events[i].obj), data: { tool: 'hammer' } };
    r.events.splice(i, 0, strike);
    r.events.forEach((e, k) => (e.seq = k + 1));
    out.push(
      A(
        'hammer',
        'Hits a compression fitting with a hammer',
        'Tool choice rule fails and the AI layer raises a low-confidence damage finding that must go to the assessor.',
        { outcome: 'Pending Review', notCritical: true },
        r,
        answers(scn, 3),
      ),
    );
  }
  return out;
}

// ───────────────────────── welder scripts ─────────────────────────
interface WOpts {
  helmet?: boolean;
  clearFlam?: boolean;
  preset?: string;
  gas?: string;
  wire?: string;
  flow?: number;
  angle?: number;
  clean?: boolean;
  tacks?: number;
  beads?: number;
  speed?: (i: number) => number;
  verdict?: 'accept' | 'reject';
  submit?: boolean;
  inspect?: boolean;
  restarts?: number;
  vent?: boolean;
}

function welderRun(scn: Scenario<WelderParams>, o: WOpts = {}): Rec {
  const w = scn.params.wps;
  const mid = (w.speedMin + w.speedMax) / 2;
  const {
    helmet = true,
    clearFlam = true,
    preset = w.preset,
    gas = w.gas,
    wire = w.wire,
    flow = (w.flowMin + w.flowMax) / 2,
    angle = (w.angleMin + w.angleMax) / 2,
    clean = true,
    tacks = 2,
    beads = SEGMENTS,
    speed = (i) => mid + Math.sin(i) * 0.7,
    verdict = 'accept',
    submit = true,
    inspect = true,
    restarts = 0,
    vent = true,
  } = o;
  const r = new Rec();
  if (helmet) r.e('ppe', undefined, { item: 'helmet', on: true });
  ['gloves', 'jacket', 'boots', 'glasses'].forEach((p) => r.e('ppe', undefined, { item: p, on: true }, 600));
  if (vent) r.e('vent', undefined, { on: true });
  r.e('extinguisher');
  if (clearFlam) scn.params.flammables.forEach((f) => r.e('clear', f));
  r.e('set_wire', undefined, { v: wire }).e('set_gas', undefined, { v: gas }).e('set_preset', undefined, { v: preset });
  r.e('set_flow', undefined, { v: flow }).e('set_angle', undefined, { v: angle });
  if (clean) r.e('clean');
  r.e('measure_gap', undefined, { mm: scn.params.fitGap }).e('clamp');
  ['s', 'e'].slice(0, tacks).forEach((p) => r.e('tack', p));
  const split = restarts > 0 ? Math.floor(beads / (restarts + 1)) : beads;
  r.e('arc_start');
  for (let i = 0; i < beads; i++) {
    r.e('bead', undefined, { i, speed: Number(speed(i).toFixed(2)) }, 300);
    if (restarts > 0 && (i + 1) % split === 0 && i + 1 < beads) r.e('arc_stop').e('arc_start');
  }
  r.e('arc_stop');
  if (beads >= SEGMENTS) {
    /* weldDone set by reducer */
  } else r.e('finish_weld');
  if (inspect) r.e('inspect_tool', undefined, { tool: 'gauge' });
  if (inspect) r.e('verdict', undefined, { v: verdict });
  if (submit) r.e('submit');
  return r;
}

function welderAttempts(scn: Scenario<WelderParams>): LabAttempt[] {
  const sid = scn.id;
  const A = (id: string, name: string, why: string, expect: LabAttempt['expect'], r: Rec, ans: Answer[], meta?: EvidenceMeta): LabAttempt => ({
    id: `${sid}:${id}`,
    scenarioId: sid,
    name,
    why,
    expect,
    events: r.events,
    answers: ans,
    meta,
  });
  const out: LabAttempt[] = [];

  if (scn.params.mode === 'inspect') {
    const insp = (o: { ppe?: string[]; flags?: [number, string][]; verdict?: 'accept' | 'reject'; tool?: boolean; submit?: boolean } = {}) => {
      const { ppe = ['glasses', 'gloves'], flags = [[6, 'porosity'], [13, 'undercut'], [19, 'lackFusion']], verdict = 'reject', tool = true, submit = true } = o;
      const r = new Rec();
      ppe.forEach((p) => r.e('ppe', undefined, { item: p, on: true }));
      if (tool) r.e('inspect_tool', undefined, { tool: 'gauge' });
      flags.forEach(([s, t]) => r.e('flag', undefined, { seg: s, type: t }, 2500));
      if (verdict) r.e('verdict', undefined, { v: verdict });
      if (submit) r.e('submit');
      return r;
    };
    out.push(A('expert', 'Expert inspector (reference)', 'All three defect zones located and typed; correct reject decision.', { outcome: 'Qualified', notCritical: true }, insp(), answers(scn, 3)));
    out.push(
      A(
        'misjudged',
        'Misses every defect and accepts the weld',
        'SOP §7.3: wrong accept decision on a defective weld, with a false flag → fails.',
        { outcome: 'Not Qualified', notCritical: true },
        insp({ flags: [[2, 'porosity']], verdict: 'accept' }),
        answers(scn, 1),
      ),
    );
    out.push(
      A(
        'mislabelled',
        'Finds the defects but mislabels one, weak reasoning',
        'Location ok, classification partial, knowledge below threshold → Conditionally Qualified.',
        { outcome: 'Conditionally Qualified', notCritical: true },
        insp({ flags: [[6, 'porosity'], [13, 'porosity'], [19, 'lackFusion']] }),
        answers(scn, 1),
      ),
    );
    out.push(
      A(
        'no-ppe',
        'Skips PPE while handling the coupon',
        'Competency-minimum boundary: Safety group 0 % fails the minimum even though everything else is right (non-critical).',
        { outcome: 'Not Qualified', notCritical: true },
        insp({ ppe: [] }),
        answers(scn, 3),
      ),
    );
    out.push(A('incomplete', 'Inspects but never decides', 'No verdict recorded → incomplete attempt held for review.', { outcome: 'Pending Review' }, insp({ verdict: undefined, submit: false }), []));
    const full = insp();
    out.push(
      A(
        'evidence-gap',
        'Event stream with missing actions',
        'Missing action events are surfaced and routed to review.',
        { outcome: 'Pending Review' },
        { events: full.events.filter((e) => e.seq !== 3 && e.seq !== 4) } as Rec,
        answers(scn, 3),
      ),
    );
    out.push(A('recording-failed', 'Canvas recording failed', 'Recording failure held for assessor decision.', { outcome: 'Pending Review' }, insp(), answers(scn, 3), failedRecording));
    out.push(
      A(
        'unsure',
        'Expert hands, uncertain spoken answer',
        'Interview answer marked unsure → low-confidence finding → assessor must review the reasoning.',
        { outcome: 'Pending Review', notCritical: true },
        insp(),
        answers(scn, 'unsure'),
      ),
    );
    return out;
  }

  // full welding scenarios
  const wrongPreset = scn.params.wps.preset === 'p140' ? 'p200' : 'p140';
  out.push(A('expert', 'Expert welder (reference)', 'PPE, hot-work checks, WPS settings, prep, tack, in-range travel speed, correct inspection.', { outcome: 'Qualified', notCritical: true }, welderRun(scn), answers(scn, 3)));
  out.push(
    A(
      'unsafe',
      'Strikes the arc without a helmet, rags still on the bench',
      'SOP §2.1 / §2.2: arc without eye protection and un-cleared flammables are critical errors.',
      { outcome: 'Not Qualified', critical: ['helmet', 'flammables'] },
      welderRun(scn, { helmet: false, clearFlam: false }),
      answers(scn, 3),
    ),
  );
  out.push(A('weak-reasoning', 'Good weld, weak reasoning', 'Practical passes, interview below threshold → Conditionally Qualified.', { outcome: 'Conditionally Qualified', notCritical: true }, welderRun(scn), answers(scn, 1)));
  out.push(
    A(
      'wrong-current',
      `Uses the wrong current preset (${wrongPreset.toUpperCase()}) – ignores the WPS`,
      'Parameter-selection test: the thickness-specific current is part of the WPS; wrong heat input creates defects, which the candidate then fails to recognise.',
      { outcome: 'Not Qualified', notCritical: true },
      welderRun(scn, { preset: wrongPreset, gas: 'ar', clean: false, tacks: 1, verdict: 'accept' }),
      answers(scn, 1),
    ),
  );
  {
    const r = welderRun(scn, { beads: 10, inspect: false, submit: false });
    out.push(A('incomplete', 'Stops after a third of the seam', 'Incomplete weld, no inspection → held for review.', { outcome: 'Pending Review' }, r, []));
  }
  {
    const full = welderRun(scn);
    out.push(
      A(
        'evidence-gap',
        'Event stream with missing actions',
        'Missing action events are surfaced and routed to review.',
        { outcome: 'Pending Review' },
        { events: full.events.filter((e) => e.seq < 20 || e.seq > 24) } as Rec,
        answers(scn, 3),
      ),
    );
  }
  out.push(A('recording-failed', 'Canvas recording failed', 'Recording failure held for assessor decision.', { outcome: 'Pending Review' }, welderRun(scn), answers(scn, 3), failedRecording));
  out.push(
    A(
      'stop-start',
      'Stops and restarts the arc several times',
      'AI layer cannot verify stop/start overlap zones from simulation data → low-confidence finding routed to the assessor.',
      { outcome: 'Pending Review', notCritical: true },
      welderRun(scn, { restarts: 3 }),
      answers(scn, 3),
    ),
  );
  return out;
}

export function buildLabAttempts(): LabAttempt[] {
  const all: LabAttempt[] = [];
  for (const s of SCENARIOS) {
    if (s.trade === 'plumber') all.push(...plumberAttempts(s as Scenario<PlumberParams>));
    else all.push(...welderAttempts(s as Scenario<WelderParams>));
  }
  return all;
}
export { scenarioById };
