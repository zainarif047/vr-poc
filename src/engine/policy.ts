// Placeholder assessment policy. Thresholds, competency minimums and critical triggers
// require client / trade-expert approval (proposal §4.5) – shown as such in the UI.
export const POLICY = {
  version: 'Policy v0.1 · placeholder pending client approval',
  qualified: { practical: 80, competencyMin: 60, knowledge: 60 },
  conditional: { practical: 60, competencyMin: 40 },
  reviewConfidence: 0.75,
  evaluator: 'sim-evaluator 0.1 (rules + scripted AI layer)',
  requireRecording: true,
};
