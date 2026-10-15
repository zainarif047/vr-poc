import { describe, expect, it } from 'vitest';
import { buildLabAttempts } from './attempts';
import { evaluate, scenarioById } from './index';

const attempts = buildLabAttempts();

describe('SOP engine – scripted attempts', () => {
  for (const a of attempts) {
    it(`${a.id} → ${a.expect.outcome}`, () => {
      const ev = evaluate(scenarioById(a.scenarioId), a.events, a.answers, a.meta);
      const info = `${a.id}: outcome=${ev.outcome} proposed=${ev.proposed} practical=${ev.practical} knowledge=${ev.knowledge}\n${ev.reviewReasons.join('\n')}\n${ev.criteria.filter((c) => c.passed !== true).map((c) => c.id + '=' + c.passed + ' ' + (c.note ?? '')).join('\n')}`;
      expect(ev.outcome, info).toBe(a.expect.outcome);
      if (a.expect.critical) for (const id of a.expect.critical) expect(ev.criticalErrors.map((c) => c.id), info).toContain(id);
      if (a.expect.notCritical) expect(ev.criticalErrors.length, info).toBe(0);
    });
  }
});
