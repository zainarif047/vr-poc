import { scenarioById } from '../engine';
import { useSession } from '../store/session';
import { Avatar, InterviewerPanel } from './Interviewer';

export function FollowUp() {
  const s = useSession();
  const scn = scenarioById(s.scenarioId);
  const q = scn.questions[s.qIndex];
  return (
    <div className="followup">
      <div className="fu-left">
        <InterviewerPanel />
      </div>
      <div className="card fu-main">
        <div className="eyebrow">
          FOLLOW-UP QUESTIONS · {Math.min(s.qIndex + 1, scn.questions.length)} / {scn.questions.length}
        </div>
        {q ? (
          <>
            <h2>{q.topic}</h2>
            <p className="q">{q.spoken}</p>
            <p className="hint">
              In production the candidate answers by voice (Deepgram STT → transcript). In this POC, choose the answer closest to what you would say.
            </p>
            <div className="options">
              {q.options.map((o) => (
                <button key={o.id} className="opt" disabled={s.speaking} onClick={() => s.answerQuestion(o.id)}>
                  {o.text}
                </button>
              ))}
              <button className="opt unsure" disabled={s.speaking} onClick={() => s.answerQuestion('unsure')}>
                I am not sure
              </button>
            </div>
            {s.speaking && <p className="hint">The interviewer is speaking…</p>}
          </>
        ) : (
          <p className="q">All questions answered. Preparing evaluation…</p>
        )}
      </div>
    </div>
  );
}

const STEPS = [
  'Validate evidence completeness (event sequence, timestamps, recording)',
  'Apply SOP rules: isolation, PPE, sequence, tolerances, critical errors',
  'AI analysis of action evidence and spoken reasoning (simulated)',
  'Combine evidence-linked findings and weighted competency scores',
  'Route uncertain / material findings to the assessor review queue',
];

export function Evaluating() {
  const step = useSession((s) => s.evalStep);
  return (
    <div className="evaluating">
      <div className="card">
        <Avatar speaking />
        <h2>Evaluating attempt</h2>
        <ol className="pipeline">
          {STEPS.map((t, i) => (
            <li key={i} className={step > i ? 'done' : step === i ? 'run' : ''}>
              <span className="dot">{step > i ? '✓' : step === i ? '…' : '○'}</span>
              {t}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
