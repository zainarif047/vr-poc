// Shared assessment types. Mirrors the proposal's data model (§5.3):
// Attempt, ActionEvent, EvaluationFinding, Score, ReviewerDecision, ScenarioVersion, SOP/RubricVersion.

export type Trade = 'plumber' | 'welder';

/** Structured action event. Evaluator reads ONLY this log (never browser-submitted scores). */
export interface ActionEvent {
  seq: number; // contiguous sequence number, 1..n
  t: number; // ms since session start
  type: string;
  obj?: string; // object identifier (slot id, tool id, ...)
  data?: Record<string, string | number | boolean>;
}

export interface Competency {
  id: string;
  label: string;
  weight: number; // % from the AZIZ matrix discovery inputs (proposal §4.5)
}

export interface TimelineStep<S> {
  ev: ActionEvent;
  before: S;
  after: S;
}

export interface EvalContext<S = any> {
  scenario: Scenario;
  events: ActionEvent[];
  timeline: TimelineStep<S>[];
  initial: S;
  final: S;
}

export interface CriterionResult {
  passed: boolean | null; // null = could not be assessed from the evidence
  evidence: number[]; // event seq numbers
  note?: string;
}

export interface Criterion<S = any> {
  id: string;
  competency: string;
  label: string;
  sop: string; // SOP clause the rule enforces
  weight: number; // relative weight inside its competency group
  critical?: boolean; // safety-critical: failing overrides numeric score
  check: (ctx: EvalContext<S>) => CriterionResult;
}

export interface QuestionOption {
  id: string;
  text: string;
  correct: boolean;
}
export interface Question {
  id: string;
  topic: string;
  spoken: string;
  options: QuestionOption[];
  rationale: string;
}
export interface Answer {
  qid: string;
  optionId: string; // 'unsure' allowed
  t: number;
}

export interface Scenario<P = any> {
  id: string;
  trade: Trade;
  title: string;
  short: string;
  version: string;
  sopRef: string;
  rubricVersion: string;
  difficulty: string;
  focus: string;
  spec: { label: string; value: string }[];
  briefing: string[]; // interviewer script: greeting + task assignment
  scope: string[]; // competency ids assessed by this scenario
  criteria: Criterion[];
  questions: Question[];
  params: P;
  /** completeness test — incomplete attempts are held for review, never auto-passed */
  required: (ctx: EvalContext) => string[]; // list of missing items
}

export type Severity = 'critical' | 'major' | 'minor' | 'info' | 'positive';
export interface Finding {
  id: string;
  source: 'SOP rule' | 'AI evaluator (simulated)' | 'Interview';
  severity: Severity;
  text: string;
  evidence: number[];
  confidence: number; // 0..1
  criterionId?: string;
}

export interface CriterionOutcome {
  id: string;
  competency: string;
  label: string;
  sop: string;
  weight: number;
  critical: boolean;
  passed: boolean | null;
  evidence: number[];
  note?: string;
}

export interface CompetencyScore {
  id: string;
  label: string;
  weight: number;
  inScope: boolean;
  score: number | null; // 0..100
  unassessed: boolean;
}

export type Outcome = 'Qualified' | 'Conditionally Qualified' | 'Not Qualified' | 'Pending Review';

export interface Evaluation {
  scenarioId: string;
  scenarioVersion: string;
  rubricVersion: string;
  evaluatorVersion: string;
  criteria: CriterionOutcome[];
  competencies: CompetencyScore[];
  practical: number;
  knowledge: number | null;
  knowledgeDetail: { qid: string; topic: string; correct: boolean | null; chosen: string; rationale: string }[];
  criticalErrors: CriterionOutcome[];
  findings: Finding[];
  evidence: { complete: boolean; issues: string[] };
  completeness: { complete: boolean; missing: string[] };
  reviewReasons: string[];
  proposed: Outcome; // threshold-based result before review routing
  outcome: Outcome;
  outcomeReasons: string[];
}

export interface ReviewerDecision {
  decision: Outcome;
  rationale: string;
  reviewer: string;
  at: string;
  changedFromProposed: boolean;
}

export interface EvidenceMeta {
  recording: 'recorded' | 'unsupported' | 'failed' | 'not-started' | 'simulated-off';
  recordingUrl?: string;
  recordingBytes?: number;
  transcript: { t: number; who: 'interviewer' | 'candidate'; text: string }[];
}

export interface Attempt {
  id: string;
  candidateId: string;
  candidateName: string;
  scenarioId: string;
  startedAt: string;
  events: ActionEvent[];
  answers: Answer[];
  evidence: EvidenceMeta;
  evaluation: Evaluation;
  review?: ReviewerDecision;
  source: 'live' | 'lab';
}
