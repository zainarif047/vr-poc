import { useMemo, useState } from 'react';
import { COMPETENCIES, scenarioById } from '../engine';
import { fmtT } from '../engine/helpers';
import { POLICY } from '../engine/policy';
import type { Attempt, Outcome, Severity } from '../engine/types';
import { useSession } from '../store/session';

const oc = (o: Outcome) => (o === 'Qualified' ? 'q' : o === 'Conditionally Qualified' ? 'c' : o === 'Not Qualified' ? 'n' : 'p');
const sevIcon: Record<Severity, string> = { critical: '⛔', major: '▲', minor: '△', info: 'ⓘ', positive: '✔' };

export function EvidenceChips({ ids, onPick }: { ids: number[]; onPick: (ids: number[]) => void }) {
  if (!ids.length) return null;
  return (
    <span className="evchips">
      {ids.slice(0, 6).map((i) => (
        <button key={i} className="evchip" onClick={() => onPick(ids)} title="Highlight in the event timeline">
          #{i}
        </button>
      ))}
      {ids.length > 6 && <small>+{ids.length - 6}</small>}
    </span>
  );
}

export function ReportView({ attempt, live }: { attempt: Attempt; live: boolean }) {
  const startReplay = useSession((s) => s.startReplay);
  const review = useSession((s) => s.review);
  const resetToCheckin = useSession((s) => s.resetToCheckin);
  const scn = scenarioById(attempt.scenarioId);
  const ev = attempt.evaluation;
  const [hl, setHl] = useState<number[]>([]);
  const [reviewer, setReviewer] = useState('Assessor 01');
  const [rationale, setRationale] = useState('');
  const [decision, setDecision] = useState<Outcome>(ev.outcome === 'Pending Review' ? ev.proposed : ev.outcome);
  const final = attempt.review;
  const shown: Outcome = final ? final.decision : ev.outcome;
  const comps = COMPETENCIES[scn.trade];
  const byComp = useMemo(() => comps.map((c) => ({ c, list: ev.criteria.filter((x) => x.competency === c.id) })), [comps, ev]);
  const pick = (ids: number[]) => {
    setHl(ids);
    const el = document.getElementById('ev-' + ids[0]);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <div className="report">
      <div className="rep-head">
        <div>
          <div className="eyebrow">ASSESSMENT REPORT · {attempt.id}</div>
          <h1>{scn.title}</h1>
          <p className="muted">
            {attempt.candidateName || 'Candidate'} ({attempt.candidateId}) · {scn.trade} · {scn.sopRef}
          </p>
          <p className="muted small">
            Scenario {scn.version} · {scn.rubricVersion} · {POLICY.version} · {ev.evaluatorVersion}
            {attempt.source === 'lab' && ' · scripted lab attempt'}
          </p>
        </div>
        <div className="rep-actions">
          <button className="primary" onClick={() => startReplay(attempt.scenarioId, attempt.events, attempt.evaluation.scenarioId)}>
            ▶ Replay attempt in 3D
          </button>
          <button className="mini" onClick={() => window.print()}>
            🖨 Print employer report
          </button>
          {live && (
            <button className="mini" onClick={() => resetToCheckin()}>
              ＋ New assessment
            </button>
          )}
        </div>
      </div>

      <div className={`outcome ${oc(shown)}`}>
        <div className="o-main">
          <div className="o-label">{final ? 'FINAL RESULT (assessor-approved)' : 'PROVISIONAL RESULT – awaiting assessor review'}</div>
          <div className="o-value">{shown}</div>
          {!final && ev.outcome === 'Pending Review' && (
            <div className="o-sub">
              Threshold result would be <b>{ev.proposed}</b>, but the attempt is held for review.
            </div>
          )}
          {final && (
            <div className="o-sub">
              {final.reviewer} · {new Date(final.at).toLocaleString()} {final.changedFromProposed && '· differs from proposed result'}
            </div>
          )}
        </div>
        <div className="o-scores">
          <div>
            <small>Practical (simulated)</small>
            <b>{ev.practical}</b>
          </div>
          <div>
            <small>Knowledge / reasoning</small>
            <b>{ev.knowledge === null ? 'n/a' : ev.knowledge}</b>
          </div>
        </div>
      </div>

      {(ev.outcomeReasons.length > 0 || ev.criticalErrors.length > 0) && (
        <div className="card">
          <h2>Why this result</h2>
          <ul className="plain">
            {ev.outcomeReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {ev.criticalErrors.length > 0 && (
        <div className="card crit">
          <h2>⛔ Critical errors (override the numeric score)</h2>
          {ev.criticalErrors.map((c) => (
            <div key={c.id} className="crit-row">
              <b>{c.label}</b>
              <div className="muted small">
                {c.sop}
                {c.note && ' · ' + c.note}
              </div>
              <EvidenceChips ids={c.evidence} onPick={pick} />
            </div>
          ))}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>Competency scores</h2>
          <p className="muted small">
            Weights are the AZIZ matrix discovery inputs. Groups not covered by this scenario are shown as not assessed – they are never counted as a
            pass.
          </p>
          {ev.competencies.map((c) => (
            <div key={c.id} className={`comp ${c.inScope ? '' : 'off'}`}>
              <div className="comp-h">
                <span>{c.label}</span>
                <span className="muted">{c.weight}%</span>
                <b>{!c.inScope ? 'not in scope' : c.unassessed ? 'not assessed' : c.score + '%'}</b>
              </div>
              <div className="meter">
                <i
                  style={{ width: `${c.inScope && !c.unassessed ? c.score : 0}%` }}
                  className={(c.score ?? 0) >= POLICY.qualified.competencyMin ? 'g' : (c.score ?? 0) >= POLICY.conditional.competencyMin ? 'a' : 'r'}
                />
              </div>
            </div>
          ))}
          <p className="muted small">
            Policy (placeholder, requires client approval): Qualified ≥ {POLICY.qualified.practical} practical, ≥ {POLICY.qualified.competencyMin} every
            group, ≥ {POLICY.qualified.knowledge} knowledge · Conditional ≥ {POLICY.conditional.practical} / {POLICY.conditional.competencyMin}.
            Critical error = Not Qualified. Missing evidence or low-confidence findings = held for review.
          </p>
        </div>

        <div className="card">
          <h2>Interview – knowledge &amp; reasoning</h2>
          {ev.knowledgeDetail.map((k) => (
            <div key={k.qid} className={`kq ${k.correct === true ? 'ok' : k.correct === false ? 'bad' : 'unk'}`}>
              <b>
                {k.correct === true ? '✔' : k.correct === false ? '✖' : '?'} {k.topic}
              </b>
              <div className="small">{k.chosen}</div>
              {k.correct !== true && <div className="muted small">{k.rationale}</div>}
            </div>
          ))}
          <h2 style={{ marginTop: 18 }}>Evidence status</h2>
          <ul className="plain small">
            <li>
              Event log: {attempt.events.length} events · {ev.evidence.complete ? 'complete' : 'INCOMPLETE'}
            </li>
            {ev.evidence.issues.map((i, k) => (
              <li key={k} className="warn">
                {i}
              </li>
            ))}
            <li>Recording: {attempt.evidence.recording}{attempt.evidence.recordingBytes ? ` · ${(attempt.evidence.recordingBytes / 1024).toFixed(0)} KB` : ''}</li>
            <li>Transcript segments: {attempt.evidence.transcript.length + attempt.answers.length * 0}</li>
            <li>Completeness: {ev.completeness.complete ? 'attempt complete' : 'incomplete – ' + ev.completeness.missing.join('; ')}</li>
          </ul>
          {attempt.evidence.recordingUrl && live && <video className="rec-video" controls src={attempt.evidence.recordingUrl} />}
        </div>
      </div>

      <div className="card">
        <h2>SOP rule results</h2>
        {byComp.map(({ c, list }) => (
          <div key={c.id}>
            <h3 className="grp">
              {c.label} <span className="muted">{c.weight}%</span>
              {!scn.scope.includes(c.id) && <em> · not in scope for this scenario</em>}
            </h3>
            {list.map((r) => (
              <div key={r.id} className={`rule ${r.passed === true ? 'pass' : r.passed === false ? 'fail' : 'na'}`}>
                <span className="mark">{r.passed === true ? '✔' : r.passed === false ? '✖' : '?'}</span>
                <div className="rule-b">
                  <b>
                    {r.label} {r.critical && <em className="tagc">CRITICAL</em>}
                  </b>
                  <div className="muted small">
                    {r.sop} · weight {r.weight}
                    {r.note ? ' · ' + r.note : ''}
                  </div>
                </div>
                <EvidenceChips ids={r.evidence} onPick={pick} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Findings (rule + simulated AI + interview)</h2>
        <p className="muted small">
          Findings below {Math.round(POLICY.reviewConfidence * 100)} % confidence are not auto-applied; they route the attempt to the assessor.
        </p>
        {ev.findings
          .filter((f) => f.severity !== 'info' || f.confidence < 1)
          .map((f) => (
            <div key={f.id} className={`finding sev-${f.severity}`}>
              <span className="sev">{sevIcon[f.severity]}</span>
              <div className="grow">
                <div>{f.text}</div>
                <div className="muted small">
                  {f.source} · confidence {Math.round(f.confidence * 100)}%{f.confidence < POLICY.reviewConfidence && f.severity !== 'positive' && ' · → assessor review'}
                </div>
              </div>
              <EvidenceChips ids={f.evidence} onPick={pick} />
            </div>
          ))}
      </div>

      {ev.reviewReasons.length > 0 && (
        <div className="card">
          <h2>Review queue reasons</h2>
          <ul className="plain">
            {ev.reviewReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card review">
        <h2>Assessor review &amp; finalisation</h2>
        {final ? (
          <div className="final-box">
            <b>{final.decision}</b> – {final.reviewer}, {new Date(final.at).toLocaleString()}
            <p>{final.rationale}</p>
            <small>Decision is stored with timestamp and rationale (audit record). Scenario and rubric versions are frozen with the attempt.</small>
          </div>
        ) : (
          <>
            <p className="muted small">
              A qualified human assessor reviews the evidence, resolves exceptions and approves the outcome. AI narrative alone is never the final
              decision.
            </p>
            <div className="row wrap">
              <label className="sel">
                Reviewer
                <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
              </label>
              <label className="sel">
                Decision
                <select value={decision} onChange={(e) => setDecision(e.target.value as Outcome)}>
                  {(['Qualified', 'Conditionally Qualified', 'Not Qualified', 'Pending Review'] as Outcome[]).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
            </div>
            {ev.criticalErrors.length > 0 && decision !== 'Not Qualified' && decision !== 'Pending Review' && (
              <p className="warn small">⚠ This decision overrides a critical safety error. The override will be recorded in the audit trail.</p>
            )}
            <label className="sel">
              Rationale (required)
              <textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Evidence reviewed and basis for the decision…" />
            </label>
            <button
              className="primary"
              disabled={rationale.trim().length < 8}
              onClick={() => review({ decision, rationale: rationale.trim(), reviewer, changedFromProposed: decision !== ev.proposed })}
            >
              Finalise assessment
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h2>Evidence timeline ({attempt.events.length} events)</h2>
        <div className="timeline">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Action</th>
                <th>Object</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {attempt.events.map((e) => (
                <tr key={e.seq} id={'ev-' + e.seq} className={hl.includes(e.seq) ? 'hl' : ''}>
                  <td>{e.seq}</td>
                  <td className="mono">{fmtT(e.t)}</td>
                  <td>{e.type}</td>
                  <td>{e.obj ?? ''}</td>
                  <td className="muted">{e.data ? JSON.stringify(e.data) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {attempt.evidence.transcript.length > 0 && (
          <>
            <h3 className="grp">Interview transcript</h3>
            {attempt.evidence.transcript.map((t, i) => (
              <div key={i} className={`tline ${t.who}`}>
                <b>{t.who === 'interviewer' ? 'Interviewer' : 'Candidate'}</b>
                {t.text}
              </div>
            ))}
          </>
        )}
      </div>

      <EmployerReport attempt={attempt} />
    </div>
  );
}

function EmployerReport({ attempt }: { attempt: Attempt }) {
  const scn = scenarioById(attempt.scenarioId);
  const ev = attempt.evaluation;
  const final = attempt.review;
  const shown = final ? final.decision : ev.outcome;
  return (
    <div className="card employer-report">
      <h2>Employer report (structured)</h2>
      <table className="kv">
        <tbody>
          <tr>
            <th>Candidate</th>
            <td>
              {attempt.candidateName} · {attempt.candidateId}
            </td>
          </tr>
          <tr>
            <th>Occupation / task</th>
            <td>
              {scn.trade} · {scn.title}
            </td>
          </tr>
          <tr>
            <th>Assessment conditions</th>
            <td>
              Simulated 3D environment, supervised prototype procedure. {scn.spec.map((s) => `${s.label}: ${s.value}`).join(' · ')}
            </td>
          </tr>
          <tr>
            <th>Competencies assessed</th>
            <td>
              {ev.competencies
                .filter((c) => c.inScope)
                .map((c) => `${c.label} ${c.unassessed ? '(not assessed)' : c.score + '%'}`)
                .join(' · ')}
            </td>
          </tr>
          <tr>
            <th>Not assessed in this scenario</th>
            <td>{ev.competencies.filter((c) => !c.inScope).map((c) => c.label).join(', ') || '—'}</td>
          </tr>
          <tr>
            <th>Scores</th>
            <td>
              Practical (simulated) {ev.practical}/100 · Knowledge &amp; reasoning {ev.knowledge ?? 'n/a'}
            </td>
          </tr>
          <tr>
            <th>Critical errors</th>
            <td>{ev.criticalErrors.length ? ev.criticalErrors.map((c) => c.label).join('; ') : 'None recorded'}</td>
          </tr>
          <tr>
            <th>Gaps</th>
            <td>
              {ev.criteria.filter((c) => c.passed === false && !c.critical).map((c) => c.label).join('; ') || 'None'}
            </td>
          </tr>
          <tr>
            <th>Outcome</th>
            <td>
              <b>{shown}</b> {final ? '(assessor-approved ' + new Date(final.at).toLocaleDateString() + ')' : '(provisional – assessor review pending)'}
            </td>
          </tr>
          <tr>
            <th>Evidence references</th>
            <td>
              {attempt.events.length} action events · recording {attempt.evidence.recording} · {attempt.evidence.transcript.length} transcript segments ·
              ids #{ev.findings.flatMap((f) => f.evidence).slice(0, 8).join(', #') || '—'}
            </td>
          </tr>
          <tr>
            <th>Versions</th>
            <td>
              Scenario {scn.version} · {scn.rubricVersion} · {POLICY.version} · {ev.evaluatorVersion}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        This report reflects performance demonstrated in a virtual environment. It does not independently prove physical workmanship, weld integrity
        or pipe-joint quality, and it is a private skills assessment – not an official Saudi government certification unless formally authorised.
      </p>
    </div>
  );
}

export function Report() {
  const attempt = useSession((s) => s.attempt);
  const setScreen = useSession((s) => s.setScreen);
  if (!attempt)
    return (
      <div className="card">
        <p>No report open.</p>
        <button className="primary" onClick={() => setScreen('checkin')}>
          Back
        </button>
      </div>
    );
  return <ReportView attempt={attempt} live={attempt.source === 'live'} />;
}
