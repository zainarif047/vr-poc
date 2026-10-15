import type { EvalContext, Finding } from './types';
import { evidenceOf, seqs } from './helpers';
import type { PlumberState } from './plumber/reducer';
import type { WelderState } from './welder/reducer';
import { SEGMENTS } from './welder/reducer';
import { part } from './plumber/catalog';

/**
 * Simulated "AI evaluator" layer. In production this is a multimodal model reasoning over
 * frames + transcripts. Here it is deterministic heuristics over the action log so the
 * POC can demonstrate how confidence routes findings to a human assessor.
 */
export function plumberAi(c: EvalContext<PlumberState>): Finding[] {
  const out: Finding[] = [];
  let n = 0;
  const add = (f: Omit<Finding, 'id' | 'source'>) => out.push({ id: `ai-${++n}`, source: 'AI evaluator (simulated)', ...f });

  const removes = c.timeline.filter((s) => s.ev.type === 'remove');
  if (removes.length)
    add({
      severity: 'minor',
      text: `${removes.length} component(s) were removed after fitting – indicates rework or a selection change.`,
      evidence: seqs(removes.map((r) => r.ev)),
      confidence: 0.9,
    });

  const early = c.timeline.filter((s) => s.ev.type === 'pressure_test' && ['incomplete', 'blocked'].includes(s.after.lastTest));
  if (early.length)
    add({
      severity: 'minor',
      text: `Pressure test attempted ${early.length}× before the installation was complete or the supply was open.`,
      evidence: seqs(early.map((e) => e.ev)),
      confidence: 0.85,
    });

  const hammer = c.events.filter((e) => e.type === 'wrong_tool' && e.data?.tool === 'hammer');
  if (hammer.length)
    add({
      severity: 'major',
      text: 'A hammer was applied to a compression fitting. Possible body damage cannot be confirmed from simulation data alone – assessor to review.',
      evidence: seqs(hammer),
      confidence: 0.6,
    });

  const measureFirst = c.events.filter((e) => e.type === 'measure');
  const firstPlace = c.events.find((e) => e.type === 'place');
  if (measureFirst.length && firstPlace && measureFirst[0].seq < firstPlace.seq)
    add({ severity: 'positive', text: 'Candidate measured before selecting parts – good planning behaviour.', evidence: [measureFirst[0].seq], confidence: 0.9 });

  const leakThenPass = c.timeline.some((s) => s.ev.type === 'pressure_test' && s.after.lastTest === 'leak') && c.final.lastTest === 'pass';
  if (leakThenPass)
    add({
      severity: 'positive',
      text: 'Leak was found by the test, repaired and then verified with a passing retest.',
      evidence: evidenceOf(c.events, 'pressure_test'),
      confidence: 0.9,
    });

  const swapped = c.timeline.filter((s) => s.ev.type === 'place' && s.before.slots[String(s.ev.obj)].part && part(String(s.ev.data?.part)).defective);
  if (swapped.length)
    add({ severity: 'minor', text: 'A defective component was re-fitted over an existing part.', evidence: seqs(swapped.map((x) => x.ev)), confidence: 0.7 });

  return out;
}

export function welderAi(c: EvalContext<WelderState>): Finding[] {
  const out: Finding[] = [];
  let n = 0;
  const add = (f: Omit<Finding, 'id' | 'source'>) => out.push({ id: `ai-${++n}`, source: 'AI evaluator (simulated)', ...f });

  const beads = c.events.filter((e) => e.type === 'bead');
  if (beads.length > 4) {
    const sp = beads.map((b) => Number(b.data?.speed));
    const mean = sp.reduce((a, b) => a + b, 0) / sp.length;
    const sd = Math.sqrt(sp.reduce((a, b) => a + (b - mean) ** 2, 0) / sp.length);
    if (sd / mean > 0.3)
      add({
        severity: 'minor',
        text: `Travel speed varied considerably along the seam (CV ${(sd / mean * 100).toFixed(0)} %) – technique consistency should be reviewed.`,
        evidence: seqs(beads).slice(0, 4),
        confidence: 0.8,
      });
  }

  const stops = c.events.filter((e) => e.type === 'arc_stop');
  const starts = c.events.filter((e) => e.type === 'arc_start');
  if (starts.length > 2 && c.final.segs.filter(Boolean).length > 0)
    add({
      severity: 'major',
      text: `Weld was interrupted ${starts.length - 1}× – restart zones can hide stop/start defects that the simulation cannot confirm. Assessor review recommended.`,
      evidence: seqs(stops).slice(0, 5),
      confidence: 0.6,
    });

  const firstArc = c.events.find((e) => ['tack', 'arc_start'].includes(e.type));
  if (firstArc) {
    const drift = c.events.filter((e) => e.seq > firstArc.seq && e.type.startsWith('set_'));
    if (drift.length)
      add({ severity: 'minor', text: `Machine settings were changed ${drift.length}× after welding started.`, evidence: seqs(drift), confidence: 0.85 });
  }

  const found = c.final.flags.length;
  if (c.final.verdict && found)
    add({
      severity: 'positive',
      text: `Inspection decision was supported by ${found} located defect flag(s).`,
      evidence: evidenceOf(c.events, 'flag', 'verdict'),
      confidence: 0.85,
    });
  if (c.final.verdict && !found && c.final.segs.some((s) => s && s.defect !== 'none'))
    add({
      severity: 'major',
      text: 'A verdict was recorded without locating any defects on the bead.',
      evidence: evidenceOf(c.events, 'verdict'),
      confidence: 0.8,
    });

  const covered = c.final.segs.filter(Boolean).length;
  if (covered && covered < SEGMENTS && c.final.weldDone)
    add({ severity: 'minor', text: `Weld finished early at ${covered}/${SEGMENTS} segments.`, evidence: evidenceOf(c.events, 'finish_weld'), confidence: 0.9 });

  return out;
}
