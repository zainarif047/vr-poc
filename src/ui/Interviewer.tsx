import { speak, cancelSpeech } from '../voice/tts';
import { useSession } from '../store/session';

export function Avatar({ speaking }: { speaking: boolean }) {
  return (
    <div className={`avatar ${speaking ? 'speaking' : ''}`} aria-hidden>
      <div className="av-core">AI</div>
      <i />
      <i />
      <i />
    </div>
  );
}

export function InterviewerPanel({ compact = false }: { compact?: boolean }) {
  const { speaking, subtitle, voiceOn, transcript, phase } = useSession();
  const patch = useSession((s) => s.patch);
  const last = [...transcript].reverse().find((t) => t.who === 'interviewer');
  return (
    <div className="card interviewer">
      <div className="iv-head">
        <Avatar speaking={speaking} />
        <div>
          <div className="eyebrow">AI INTERVIEWER · SCRIPTED</div>
          <div className="small">{speaking ? 'Speaking…' : phase === 'active' ? 'Observing – no hints in assessment mode' : 'Listening'}</div>
        </div>
      </div>
      <div className="subtitle" aria-live="polite">
        {subtitle || '—'}
      </div>
      <div className="row">
        <button
          className="mini"
          onClick={() => {
            patch({ voiceOn: !voiceOn });
            if (voiceOn) cancelSpeech();
          }}
        >
          {voiceOn ? '🔊 Voice on' : '🔇 Voice off'}
        </button>
        {last && (
          <button className="mini" onClick={() => speak(last.text, { audio: voiceOn })}>
            ↻ Repeat
          </button>
        )}
      </div>
      {!compact && transcript.length > 0 && (
        <div className="transcript">
          {transcript.slice(-5).map((t, i) => (
            <div key={i} className={t.who}>
              <b>{t.who === 'interviewer' ? 'Interviewer' : 'Candidate'}:</b> {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
