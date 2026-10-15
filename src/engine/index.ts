import { plumberAi, welderAi } from './ai';
import { POLICY } from './policy';
import { initialPlumber, reducePlumber } from './plumber/reducer';
import { PLUMBER_COMPETENCIES, PLUMBER_SCENARIOS } from './plumber/scenarios';
import type {
  ActionEvent,
  Answer,
  CompetencyScore,
  CriterionOutcome,
  EvalContext,
  EvidenceMeta,
  Evaluation,
  Finding,
  Outcome,
  Scenario,
  Trade,
} from './types';
import { initialWelder, reduceWelder } from './welder/reducer';
import { WELDER_COMPETENCIES, WELDER_SCENARIOS } from './welder/scenarios';

export const SCENARIOS: Scenario[] = [...PLUMBER_SCENARIOS, ...WELDER_SCENARIOS];
export const scenarioById = (id: string) => {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error('Unknown scenario ' + id);
  return s;
};
export const COMPETENCIES = { plumber: PLUMBER_COMPETENCIES, welder: WELDER_COMPETENCIES };

export interface Engine {
  initial(scn: Scenario): any;
  reduce(scn: Scenario, s: any, ev: ActionEvent): any;
  ai(c: EvalContext): Finding[];
}
export const ENGINES: Record<Trade, Engine> = {
  plumber: { initial: initialPlumber as any, reduce: reducePlumber as any, ai: plumberAi as any },
  welder: { initial: initialWelder as any, reduce: reduceWelder as any, ai: welderAi as any },
};

/** Replay events through the trade reducer. Used by the simulator, evaluator and lab alike. */
export function replay(scn: Scenario, events: ActionEvent[]) {
  const eng = ENGINES[scn.trade];
  const initial = eng.initial(scn);
  let s = initial;
  const timeline = events.map((ev) => {
    const before = s;
    s = eng.reduce(scn, s, ev);
    return { ev, before, after: s };
  });
  return { initial, final: s, timeline };
}

export function checkEvidence(events: ActionEvent[], meta?: EvidenceMeta) {
  const issues: string[] = [];
  events.forEach((e, i) => {
    if (e.seq !== i + 1 && !issues.some((x) => x.startsWith('Event sequence'))) {
      issues.push(`Event sequence gap: expected #${i + 1}, found #${e.seq} – ${e.seq - (i + 1)} action event(s) missing`);
    }
    if (i > 0 && e.t < events[i - 1].t && !issues.some((x) => x.startsWith('Timestamps'))) issues.push('Timestamps are not monotonic');
  });
  if (!events.length) issues.push('No action events captured');
  if (meta && POLICY.requireRecording && meta.recording !== 'recorded')
    issues.push(`Session recording not available (status: ${meta.recording})`);
  return { complete: issues.length === 0, issues };
}

const competencyScoreOf = (id: string, crit: CriterionOutcome[]) => {
  const list = crit.filter((c) => c.competency === id);
  const possible = list.reduce((a, c) => a + c.weight, 0);
  if (!possible) return { score: null as number | null, unassessed: true };
  const earned = list.reduce((a, c) => a + (c.passed === true ? c.weight : 0), 0);
  const allNull = list.every((c) => c.passed === null);
  return { score: Math.round((earned / possible) * 100), unassessed: allNull };
};

export function evaluate(scn: Scenario, events: ActionEvent[], answers: Answer[], meta?: EvidenceMeta): Evaluation {
  const { initial, final, timeline } = replay(scn, events);
  const ctx: EvalContext = { scenario: scn, events, timeline, initial, final };
  const evidence = checkEvidence(events, meta);

  const criteria: CriterionOutcome[] = scn.criteria.map((c) => {
    let r;
    try {
      r = c.check(ctx);
    } catch (e) {
      r = { passed: null, evidence: [], note: 'Rule error: ' + String(e) };
    }
    return {
      id: c.id,
      competency: c.competency,
      label: c.label,
      sop: c.sop,
      weight: c.weight,
      critical: !!c.critical,
      passed: r.passed,
      evidence: r.evidence,
      note: r.note,
    };
  });

  const comps = COMPETENCIES[scn.trade];
  const competencies: CompetencyScore[] = comps.map((c) => {
    const inScope = scn.scope.includes(c.id);
    if (!inScope) return { id: c.id, label: c.label, weight: c.weight, inScope, score: null, unassessed: false };
    const r = competencyScoreOf(c.id, criteria);
    return { id: c.id, label: c.label, weight: c.weight, inScope, score: r.score, unassessed: r.unassessed };
  });
  const inScope = competencies.filter((c) => c.inScope);
  const wsum = inScope.reduce((a, c) => a + c.weight, 0);
  const practical = wsum
    ? Math.round(inScope.reduce((a, c) => a + (c.unassessed ? 0 : (c.score ?? 0)) * c.weight, 0) / wsum)
    : 0;

  const knowledgeDetail = scn.questions.map((q) => {
    const a = answers.find((x) => x.qid === q.id);
    const opt = q.options.find((o) => o.id === a?.optionId);
    return {
      qid: q.id,
      topic: q.topic,
      correct: a ? (a.optionId === 'unsure' ? null : !!opt?.correct) : null,
      chosen: a ? (a.optionId === 'unsure' ? 'Candidate was not sure' : (opt?.text ?? '—')) : 'No answer recorded',
      rationale: q.rationale,
    };
  });
  const answered = knowledgeDetail.filter((k) => k.chosen !== 'No answer recorded');
  const knowledge = answered.length ? Math.round((knowledgeDetail.filter((k) => k.correct === true).length / scn.questions.length) * 100) : null;

  const criticalErrors = criteria.filter((c) => c.critical && c.passed === false);
  const missing = scn.required(ctx);
  const completeness = { complete: missing.length === 0, missing };

  // ── findings ──
  const findings: Finding[] = [];
  criteria.forEach((c) => {
    if (c.passed === false)
      findings.push({
        id: 'rule-' + c.id,
        source: 'SOP rule',
        severity: c.critical ? 'critical' : c.weight >= 2 ? 'major' : 'minor',
        text: `${c.label}${c.note ? ' — ' + c.note : ''}`,
        evidence: c.evidence,
        confidence: 1,
        criterionId: c.id,
      });
    if (c.passed === null)
      findings.push({
        id: 'rule-' + c.id,
        source: 'SOP rule',
        severity: 'info',
        text: `Could not assess: ${c.label}${c.note ? ' — ' + c.note : ''}`,
        evidence: c.evidence,
        confidence: 0.4,
        criterionId: c.id,
      });
  });
  findings.push(...ENGINES[scn.trade].ai(ctx));
  knowledgeDetail.forEach((k) => {
    findings.push({
      id: 'int-' + k.qid,
      source: 'Interview',
      severity: k.correct === true ? 'positive' : k.correct === false ? 'major' : 'info',
      text:
        k.correct === true
          ? `${k.topic}: answered correctly.`
          : k.correct === false
            ? `${k.topic}: incorrect reasoning. ${k.rationale}`
            : `${k.topic}: ${k.chosen.toLowerCase()} – spoken reasoning could not be scored.`,
      evidence: [],
      confidence: k.correct === null ? 0.5 : 0.9,
    });
  });

  // ── review routing ──
  const reviewReasons: string[] = [];
  evidence.issues.forEach((i) => reviewReasons.push('Evidence: ' + i));
  missing.forEach((m) => reviewReasons.push('Incomplete attempt: ' + m));
  competencies.filter((c) => c.inScope && c.unassessed).forEach((c) => reviewReasons.push(`Competency not assessed: ${c.label}`));
  findings
    .filter((f) => f.confidence < POLICY.reviewConfidence && f.severity !== 'positive')
    .forEach((f) => reviewReasons.push(`Low-confidence finding (${Math.round(f.confidence * 100)} %): ${f.text}`));
  if (knowledge === null) reviewReasons.push('No interview answers captured');

  // ── thresholds → proposed outcome ──
  const minComp = Math.min(...inScope.map((c) => (c.unassessed ? 0 : (c.score ?? 0))));
  let proposed: Outcome;
  const reasons: string[] = [];
  if (criticalErrors.length) {
    proposed = 'Not Qualified';
    reasons.push(...criticalErrors.map((c) => `Critical error: ${c.label}`));
  } else if (
    practical >= POLICY.qualified.practical &&
    minComp >= POLICY.qualified.competencyMin &&
    (knowledge ?? 0) >= POLICY.qualified.knowledge
  ) {
    proposed = 'Qualified';
  } else if (practical >= POLICY.conditional.practical && minComp >= POLICY.conditional.competencyMin) {
    proposed = 'Conditionally Qualified';
    if (practical < POLICY.qualified.practical) reasons.push(`Practical ${practical} < ${POLICY.qualified.practical} for Qualified`);
    if (minComp < POLICY.qualified.competencyMin) reasons.push(`Lowest competency ${minComp} < ${POLICY.qualified.competencyMin}`);
    if ((knowledge ?? 0) < POLICY.qualified.knowledge) reasons.push(`Knowledge ${knowledge ?? 'n/a'} < ${POLICY.qualified.knowledge}`);
  } else {
    proposed = 'Not Qualified';
    if (practical < POLICY.conditional.practical) reasons.push(`Practical ${practical} < ${POLICY.conditional.practical}`);
    if (minComp < POLICY.conditional.competencyMin) reasons.push(`Lowest competency ${minComp} < ${POLICY.conditional.competencyMin}`);
  }

  let outcome: Outcome = proposed;
  if (criticalErrors.length && !evidence.complete) {
    // a critical flag derived from a gapped event log is provisional – never fail a candidate on missing evidence
    outcome = 'Pending Review';
    reasons.unshift('Critical error is provisional: the event log is incomplete, so it cannot be relied on without assessor review');
  } else if (!criticalErrors.length && reviewReasons.length) {
    outcome = 'Pending Review';
    reasons.unshift(`Held for assessor review (${reviewReasons.length} reason${reviewReasons.length > 1 ? 's' : ''}); threshold result would be "${proposed}"`);
  }
  if (criticalErrors.length && evidence.complete && reviewReasons.length) reasons.push('Critical error stands; assessor must confirm before the report is issued');

  return {
    scenarioId: scn.id,
    scenarioVersion: scn.version,
    rubricVersion: scn.rubricVersion,
    evaluatorVersion: POLICY.evaluator,
    criteria,
    competencies,
    practical,
    knowledge,
    knowledgeDetail,
    criticalErrors,
    findings,
    evidence,
    completeness,
    reviewReasons,
    proposed,
    outcome,
    outcomeReasons: reasons,
  };
}
