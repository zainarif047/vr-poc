type Status = 'Demonstrated' | 'Simulated' | 'Partial' | 'Not in POC';
interface Row {
  ref: string;
  req: string;
  status: Status;
  how: string;
}

const ROWS: { group: string; rows: Row[] }[] = [
  {
    group: '§2 Objectives & assessment boundary',
    rows: [
      { ref: '§2', req: 'Consistent interactive assessment using predefined scenarios', status: 'Demonstrated', how: '6 versioned scenarios (3 plumbing, 3 welding), each with spec, SOP ref, rubric and questions.' },
      { ref: '§2', req: 'Assign tasks appropriate to scenario and tools', status: 'Simulated', how: 'Scripted interviewer picks from the approved library; spoken + on-screen task agree.' },
      { ref: '§2', req: 'Capture decisions, action sequence, connections, final configuration, spoken responses', status: 'Demonstrated', how: 'Structured ActionEvent log (seq, t, type, obj, data); answers captured as transcript.' },
      { ref: '§2', req: 'Evaluate against SOPs and scoring criteria; identify safety-critical errors with evidence', status: 'Demonstrated', how: 'Rule engine, critical flags, finding → event evidence references.' },
      { ref: '§2', req: 'Qualified assessor review and auditable final result', status: 'Demonstrated', how: 'Review form: decision, rationale, reviewer, timestamp; versions frozen with attempt.' },
      { ref: '§2', req: 'State assessment limits; private assessment ≠ official certification', status: 'Demonstrated', how: 'Disclaimers on employer report and simulator footer.' },
    ],
  },
  {
    group: '§3 Candidate experience',
    rows: [
      { ref: '§3.1', req: 'Register candidate, assign occupation/profile', status: 'Partial', how: 'Name + generated ID + scenario choice; no accounts or profiles.' },
      { ref: '§3.2', req: 'Supervised identity verification', status: 'Simulated', how: 'Operator confirmation checkbox only.' },
      { ref: '§3.3', req: 'Recording notice and unscored interaction tutorial', status: 'Partial', how: 'Notice acknowledged; controls guide is static (no interactive practice step).' },
      { ref: '§3.4', req: 'Join LiveKit session, speak with AI interviewer', status: 'Simulated', how: 'Browser text-to-speech reads the script. No real-time two-way voice.' },
      { ref: '§3.5', req: 'Task assigned by voice and mirrored on screen', status: 'Demonstrated', how: 'Briefing lines + task card.' },
      { ref: '§3.6', req: 'Select tools, manipulate 3D components with touch or mouse', status: 'Demonstrated', how: 'Pointer-event interaction (drag, tap, hold-drag). Touch uses the same code path; not device-tested.' },
      { ref: '§3.7', req: 'Capture actions, visual evidence, transcripts, recording references', status: 'Demonstrated', how: 'Action log, canvas recording (MediaRecorder), transcript. Held in browser, not uploaded.' },
      { ref: '§3.8', req: 'Approved follow-up questions on decisions', status: 'Simulated', how: 'Spoken questions; candidate picks an answer instead of speaking.' },
      { ref: '§3.9', req: 'Backend applies SOP rules and AI findings', status: 'Simulated', how: 'Evaluator runs client-side from the event log only.' },
      { ref: '§3.10', req: 'Assessor reviews evidence and finalises report', status: 'Demonstrated', how: 'Report → review → final result → employer report.' },
      { ref: '§3', req: 'No coaching or corrective answers in assessment mode', status: 'Demonstrated', how: 'No live checklist or hints; interviewer silent during the task.' },
    ],
  },
  {
    group: '§4.1–4.2 Simulator & scenarios',
    rows: [
      { ref: '§4.1', req: 'Browser-based 3D environment, virtual tools, materials, components', status: 'Demonstrated', how: 'React Three Fiber, procedural PBR materials, image-based lighting, shadows, bloom.' },
      { ref: '§4.1', req: 'Controlled camera navigation, guided connection points, large touch targets', status: 'Partial', how: 'Orbit limits and numbered snap positions. Touch-target sizing not validated on devices.' },
      { ref: '§4.1', req: 'Task states, completion conditions, reset behaviour, error conditions', status: 'Partial', how: 'State and completion logic present; remove/redo supported; no global reset button.' },
      { ref: '§4.1', req: 'Optimised assets and performance testing on reference devices', status: 'Not in POC', how: 'Assets are procedural primitives; no device benchmarking.' },
      { ref: '§4.2', req: 'Plumber scenario: assembly + leak-check sequence', status: 'Demonstrated', how: 'PLB-1 valve/riser, PLB-2 tee branch (22 mm), PLB-3 leak diagnosis & repair.' },
      { ref: '§4.2', req: 'Welder scenario: prep, simplified weld, inspection', status: 'Demonstrated', how: 'WLD-1 butt 3 mm, WLD-2 fillet 6 mm, WLD-3 inspection & defect identification.' },
      { ref: '§4.2', req: 'Simulated weld result not claimed as metallurgical proof', status: 'Demonstrated', how: 'Bead model is illustrative; stated in report.' },
      { ref: '§4.2', req: 'Electrical wiring as future / substitution only', status: 'Not in POC', how: 'Deliberately excluded (matches baseline).' },
    ],
  },
  {
    group: '§4.3–4.4 AI interviewer, observation & recording',
    rows: [
      { ref: '§4.3', req: 'Real-time spoken conversation via Python LiveKit agent', status: 'Not in POC', how: 'Replaced by scripted browser TTS for demonstration.' },
      { ref: '§4.3', req: 'Structured task commands keep voice and simulator in sync', status: 'Simulated', how: 'Single scenario object drives briefing and task card.' },
      { ref: '§4.3', req: 'Agent cannot alter rubric or scores; candidate speech is input, not authority', status: 'Demonstrated', how: 'Evaluator reads only the event log and answer ids; nothing the candidate says changes rules.' },
      { ref: '§4.3', req: 'Interruption / turn handling, recovery behaviour', status: 'Not in POC', how: 'Requires live voice pipeline.' },
      { ref: '§4.4', req: 'Live visual observation by a multimodal model', status: 'Not in POC', how: 'Structured events act as the authoritative description; no frames sent to a model.' },
      { ref: '§4.4', req: 'Application-canvas recording', status: 'Demonstrated', how: 'canvas.captureStream + MediaRecorder; playable in report.' },
      { ref: '§4.4', req: 'Session audio capture', status: 'Not in POC', how: 'TTS audio is not captured.' },
      { ref: '§4.4', req: 'Timestamp alignment of actions, transcripts, findings', status: 'Demonstrated', how: 'Shared millisecond clock; findings link to event seq numbers.' },
      { ref: '§4.4', req: 'Recording failure / missing evidence surfaced, not treated as success', status: 'Demonstrated', how: 'Recording-failure option and event-gap lab attempts → Pending Review.' },
    ],
  },
  {
    group: '§4.5 Evaluation & scoring',
    rows: [
      { ref: '§4.5', req: 'SOP rules layer: connections, sequence, tolerances, critical errors', status: 'Demonstrated', how: '~35 named criteria with SOP clause references across the six scenarios.' },
      { ref: '§4.5', req: 'AI evaluator layer with rubric-based findings and explanations', status: 'Simulated', how: 'Deterministic heuristics with confidence scores; routes low confidence to assessor.' },
      { ref: '§4.5', req: 'Human assessor for uncertain / material findings', status: 'Demonstrated', how: 'Review queue reasons + finalisation form.' },
      { ref: '§4.5', req: 'Separate knowledge/reasoning and practical results', status: 'Demonstrated', how: 'Two scores reported; knowledge acts as a gate for Qualified.' },
      { ref: '§4.5', req: 'Competency scores, strengths, gaps, critical flags, evidence references', status: 'Demonstrated', how: 'Competency bars, rule table, findings with evidence chips.' },
      { ref: '§4.5', req: 'Matrix weights (plumber / welder groups)', status: 'Demonstrated', how: 'Weights as listed in the proposal; renormalised across in-scope groups.' },
      { ref: '§4.5', req: 'Configurable approved weights and thresholds', status: 'Partial', how: 'Held in policy.ts and scenario files; no admin UI. Values are placeholders pending client approval.' },
      { ref: '§4.5', req: 'Critical fail / hold logic', status: 'Demonstrated', how: 'Critical error → Not Qualified; critical on gapped log → provisional, held.' },
      { ref: '§4.5', req: 'Unassessed competency never auto-passes; incomplete attempts handled explicitly', status: 'Demonstrated', how: 'Unassessed = 0 and flagged; incomplete → Pending Review.' },
    ],
  },
  {
    group: '§4.6, §5–6 Platform, data & controls',
    rows: [
      { ref: '§4.6', req: 'Candidate IDs, retrievable assessment history', status: 'Partial', how: 'Local browser history (30 attempts).' },
      { ref: '§4.6', req: 'Candidate / assessor / admin roles', status: 'Not in POC', how: 'Single user; reviewer is a name field.' },
      { ref: '§4.6', req: 'Versioned SOPs, rubrics, profiles, weightings', status: 'Partial', how: 'Version labels stored with each attempt; no version management UI.' },
      { ref: '§4.6', req: 'Structured employer report with scope, scores, errors, gaps, outcome, evidence refs', status: 'Demonstrated', how: 'Report page + print stylesheet.' },
      { ref: '§4.6', req: 'Outcomes: Qualified / Conditionally Qualified / Not Qualified / pending', status: 'Demonstrated', how: 'All four exercised by the lab attempts.' },
      { ref: '§4.6', req: 'Arabic and English interface and instructions', status: 'Not in POC', how: 'English only.' },
      { ref: '§5', req: 'React, TypeScript, Vite, Three.js, R3F, Drei, Zustand', status: 'Demonstrated', how: 'Same frontend stack as proposed.' },
      { ref: '§5', req: 'Django/DRF, PostgreSQL, Celery/Redis, LiveKit, Deepgram, S3 storage', status: 'Not in POC', how: 'Backend and real-time services are out of scope for this prototype.' },
      { ref: '§5.3', req: 'Event contract: attempt id, sequence, timestamp, action type, object ids; order validated', status: 'Demonstrated', how: 'Same schema; evaluator validates sequence and timestamps.' },
      { ref: '§6', req: 'Auth, scoped room credentials, encryption, retention, audit of config changes', status: 'Not in POC', how: 'No backend. Assessor decisions are timestamped locally.' },
    ],
  },
  {
    group: '§9 Validation & acceptance',
    rows: [
      { ref: '§9', req: 'Correct, incorrect, unsafe, incomplete and uncertain attempts', status: 'Demonstrated', how: 'SOP validation lab: 8 scripted attempts per scenario with expected outcomes (also run by vitest).' },
      { ref: '§9', req: 'Traceability from finding to source event', status: 'Demonstrated', how: 'Evidence chips jump to the event timeline row.' },
      { ref: '§9', req: 'Scoring weights, threshold boundaries and critical overrides', status: 'Demonstrated', how: 'Boundary cases: weak reasoning, competency minimum, critical override.' },
      { ref: '§9', req: 'AI comparison with expert-labelled examples', status: 'Not in POC', how: 'Requires real model and labelled dataset.' },
      { ref: '§9', req: 'Latency, 3D responsiveness, recording reliability on reference devices', status: 'Not in POC', how: 'Not benchmarked.' },
    ],
  },
];

const cls: Record<Status, string> = { Demonstrated: 'q', Simulated: 'c', Partial: 'p', 'Not in POC': 'n' };

export function Coverage() {
  const all = ROWS.flatMap((g) => g.rows);
  const count = (s: Status) => all.filter((r) => r.status === s).length;
  return (
    <div className="coverage">
      <section className="hero">
        <div className="eyebrow">HONEST SCOPE CHECK</div>
        <h1>Proposal coverage</h1>
        <p>
          What this proof of concept actually demonstrates versus what is stood in for or left for the real build. “Simulated” means the behaviour is
          shown with a stand-in (for example scripted text-to-speech instead of a LiveKit agent).
        </p>
        <div className="chips">
          {(['Demonstrated', 'Simulated', 'Partial', 'Not in POC'] as Status[]).map((s) => (
            <span key={s} className={`badge ${cls[s]}`}>
              {s}: {count(s)}
            </span>
          ))}
        </div>
      </section>
      {ROWS.map((g) => (
        <div className="card" key={g.group}>
          <h2>{g.group}</h2>
          <table className="labtable">
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i}>
                  <td className="mono nowrap">{r.ref}</td>
                  <td>{r.req}</td>
                  <td>
                    <span className={`badge ${cls[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="muted small">{r.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
