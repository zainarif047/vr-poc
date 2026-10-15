import { useMemo, useState } from 'react';
import { buildLabAttempts } from '../engine/attempts';
import { evaluate, scenarioById, SCENARIOS } from '../engine';
import type { Attempt } from '../engine/types';
import { useSession } from '../store/session';

export function Lab() {
  const openAttempt = useSession((s) => s.openAttempt);
  const startReplay = useSession((s) => s.startReplay);
  const [filter, setFilter] = useState<string>('all');

  const rows = useMemo(
    () =>
      buildLabAttempts().map((a) => {
        const scn = scenarioById(a.scenarioId);
        const ev = evaluate(scn, a.events, a.answers, a.meta);
        const okOutcome = ev.outcome === a.expect.outcome;
        const okCrit = !a.expect.critical || a.expect.critical.every((id) => ev.criticalErrors.some((c) => c.id === id));
        const okNoCrit = !a.expect.notCritical || ev.criticalErrors.length === 0;
        return { a, scn, ev, pass: okOutcome && okCrit && okNoCrit };
      }),
    [],
  );
  const total = rows.length;
  const passed = rows.filter((r) => r.pass).length;
  const shown = rows.filter((r) => filter === 'all' || r.scn.id === filter);

  const open = (r: (typeof rows)[number]) => {
    const att: Attempt = {
      id: 'LAB-' + r.a.id,
      candidateId: 'LAB',
      candidateName: r.a.name,
      scenarioId: r.a.scenarioId,
      startedAt: new Date().toISOString(),
      events: r.a.events,
      answers: r.a.answers,
      evidence: { recording: r.a.meta?.recording ?? 'recorded', transcript: [] },
      evaluation: r.ev,
      source: 'lab',
    };
    openAttempt(att);
  };

  return (
    <div className="lab">
      <section className="hero">
        <div className="eyebrow">VALIDATION OF SOPs AND SCORING POLICY</div>
        <h1>SOP validation lab</h1>
        <p>
          Scripted attempts – correct, unsafe, incomplete, uncertain and evidence-gap – are run through the <b>same</b> evaluator the live simulator
          uses. This is the acceptance-test pattern from proposal §9: each attempt declares its expected outcome and the lab checks the engine against
          it. Replay any attempt in the 3D workshop to see exactly what the candidate did.
        </p>
        <div className={`lab-sum ${passed === total ? 'ok' : 'bad'}`}>
          <b>
            {passed} / {total}
          </b>{' '}
          scripted attempts produce the expected outcome
        </div>
        <div className="chips">
          <button className={`tog ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
            All scenarios
          </button>
          {SCENARIOS.map((s) => (
            <button key={s.id} className={`tog ${filter === s.id ? 'on' : ''}`} onClick={() => setFilter(s.id)}>
              {s.trade === 'plumber' ? '🔧' : '🔥'} {s.id.toUpperCase()} · {s.title}
            </button>
          ))}
        </div>
      </section>

      <div className="card">
        <table className="labtable">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Scripted attempt &amp; SOP behaviour tested</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Prac.</th>
              <th>Know.</th>
              <th>Critical</th>
              <th>Check</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.a.id} className={r.pass ? '' : 'rowbad'}>
                <td className="mono">{r.scn.id}</td>
                <td>
                  <b>{r.a.name}</b>
                  <div className="muted small">{r.a.why}</div>
                </td>
                <td>{r.a.expect.outcome}</td>
                <td>
                  <span className={`badge ${r.ev.outcome === 'Qualified' ? 'q' : r.ev.outcome === 'Conditionally Qualified' ? 'c' : r.ev.outcome === 'Not Qualified' ? 'n' : 'p'}`}>
                    {r.ev.outcome}
                  </span>
                </td>
                <td>{r.ev.practical}</td>
                <td>{r.ev.knowledge ?? '—'}</td>
                <td>{r.ev.criticalErrors.map((c) => c.id).join(', ') || '—'}</td>
                <td>{r.pass ? <span className="okmark">✔ match</span> : <span className="badmark">✖ mismatch</span>}</td>
                <td className="nowrap">
                  <button className="mini" onClick={() => open(r)}>
                    Report
                  </button>
                  <button className="mini" onClick={() => startReplay(r.a.scenarioId, r.a.events, r.a.name)}>
                    ▶ 3D replay
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
