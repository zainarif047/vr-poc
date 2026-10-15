import { scenarioById } from '../engine';
import { useSession } from '../store/session';

export function History() {
  const history = useSession((s) => s.history);
  const openAttempt = useSession((s) => s.openAttempt);
  return (
    <div className="history">
      <section className="hero">
        <div className="eyebrow">RETRIEVABLE ASSESSMENT HISTORY</div>
        <h1>Attempt history</h1>
        <p>Stored locally in this browser. Each record keeps its scenario, rubric and evaluator versions; past results are never silently recalculated.</p>
      </section>
      <div className="card">
        {history.length === 0 ? (
          <p className="muted">No live attempts yet. Complete an assessment to see it here.</p>
        ) : (
          <table className="labtable">
            <thead>
              <tr>
                <th>Attempt</th>
                <th>Candidate</th>
                <th>Scenario</th>
                <th>When</th>
                <th>Result</th>
                <th>Practical</th>
                <th>Knowledge</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const scn = scenarioById(h.scenarioId);
                const shown = h.review?.decision ?? h.evaluation.outcome;
                return (
                  <tr key={h.id}>
                    <td className="mono">{h.id}</td>
                    <td>
                      {h.candidateName} <span className="muted">({h.candidateId})</span>
                    </td>
                    <td>{scn.title}</td>
                    <td>{new Date(h.startedAt).toLocaleString()}</td>
                    <td>
                      <b>{shown}</b> {h.review ? '· final' : '· provisional'}
                    </td>
                    <td>{h.evaluation.practical}</td>
                    <td>{h.evaluation.knowledge ?? '—'}</td>
                    <td>
                      <button className="mini" onClick={() => openAttempt(h)}>
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
