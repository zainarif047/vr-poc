import { SCENARIOS } from '../engine';
import { useSession } from '../store/session';
import { ttsSupported } from '../voice/tts';

export function CheckIn() {
  const s = useSession();
  const scn = SCENARIOS.find((x) => x.id === s.scenarioId)!;
  const ready = s.candidateName.trim().length > 1 && s.opVerified && s.noticeAccepted;
  const trades = [
    { id: 'plumber' as const, label: 'Plumber', icon: '🔧' },
    { id: 'welder' as const, label: 'Welder', icon: '🔥' },
  ];

  return (
    <div className="checkin">
      <section className="hero">
        <div className="eyebrow">LEARN BY DOING · ASSESS WITH EVIDENCE</div>
        <h1>3D skills assessment simulator</h1>
        <p>
          Phase 1 proof of concept for the Artilence assessment platform: an interactive 3D workshop, a scripted AI interviewer, structured action
          capture, SOP-based evaluation and assessor review. Six approved scenarios – three plumbing, three welding.
        </p>
      </section>

      <div className="grid-2">
        <div className="col">
          <div className="card">
            <h2>1 · Candidate registration &amp; supervised check-in</h2>
            <div className="field">
              <label>Candidate name</label>
              <input value={s.candidateName} onChange={(e) => s.patch({ candidateName: e.target.value })} placeholder="e.g. Ahmed Al-Harbi" />
            </div>
            <div className="field">
              <label>Candidate ID</label>
              <input value={s.candidateId} readOnly />
            </div>
            <label className="check">
              <input type="checkbox" checked={s.opVerified} onChange={(e) => s.patch({ opVerified: e.target.checked })} />
              <span>
                <b>Operator confirms identity</b> against the supervised prototype procedure (ID document sighted).
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={s.noticeAccepted} onChange={(e) => s.patch({ noticeAccepted: e.target.checked })} />
              <span>
                <b>Recording notice accepted.</b> The simulator canvas, actions and interview transcript are recorded as assessment evidence.
              </span>
            </label>
          </div>

          <div className="card">
            <h2>2 · Choose the approved scenario</h2>
            {trades.map((t) => (
              <div key={t.id} className="trade">
                <div className="trade-h">
                  {t.icon} {t.label}
                </div>
                <div className="scn-grid">
                  {SCENARIOS.filter((x) => x.trade === t.id).map((x) => (
                    <button key={x.id} className={`scn ${s.scenarioId === x.id ? 'on' : ''}`} onClick={() => s.setScenario(x.id)}>
                      <span className="scn-tag">{x.difficulty}</span>
                      <b>{x.title}</b>
                      <small>{x.focus}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col">
          <div className="card accent">
            <div className="eyebrow">TASK THE INTERVIEWER WILL ASSIGN</div>
            <h2>{scn.title}</h2>
            <p>{scn.short}</p>
            <table className="kv">
              <tbody>
                {scn.spec.map((r) => (
                  <tr key={r.label}>
                    <th>{r.label}</th>
                    <td>{r.value}</td>
                  </tr>
                ))}
                <tr>
                  <th>Assessed areas</th>
                  <td>{scn.focus}</td>
                </tr>
                <tr>
                  <th>SOP / rubric</th>
                  <td>
                    {scn.sopRef}
                    <br />
                    <small>
                      {scn.version} · {scn.rubricVersion}
                    </small>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>3 · Controls (unscored)</h2>
            <ul className="controls">
              <li>
                <b>Orbit</b> – drag the 3D view (limited, controlled camera). Scroll / pinch to zoom.
              </li>
              <li>
                <b>Place</b> – drag a part from the tray onto a numbered position, <i>or</i> tap the part then tap the position.
              </li>
              <li>
                <b>Tools</b> – pick a tool, then click the object it works on. Wrong tools are recorded.
              </li>
              <li>
                <b>Welding</b> – hold and drag along the seam; your travel speed is measured live.
              </li>
              <li>
                <b>Assessment mode</b> – no hints, no checklist, no corrective feedback until the report.
              </li>
            </ul>
          </div>

          <div className="card">
            <h2>Session options</h2>
            <label className="check">
              <input type="checkbox" checked={s.voiceOn} onChange={(e) => s.patch({ voiceOn: e.target.checked })} />
              <span>
                Interviewer voice (browser text-to-speech) {ttsSupported ? '' : <em className="warn"> – not supported in this browser, subtitles only</em>}
              </span>
            </label>
            <label className="sel">
              Graphics quality
              <select value={s.quality} onChange={(e) => s.patch({ quality: e.target.value as 'high' | 'low' })}>
                <option value="high">High – shadows, bloom, anti-aliasing</option>
                <option value="low">Low – for older laptops / tablets</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={s.simulateRecFail} onChange={(e) => s.patch({ simulateRecFail: e.target.checked })} />
              <span>
                <b>Test option:</b> simulate a canvas-recording failure (verifies evidence-gap handling → result held for review).
              </span>
            </label>
            <button className="primary big" disabled={!ready} onClick={() => s.startSession()}>
              ▶ Start test
            </button>
            {!ready && <p className="hint">Enter a name and complete both check-in confirmations to enable the test.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
