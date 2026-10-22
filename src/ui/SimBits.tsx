import { useEffect, useState } from 'react';
import { fmtT } from '../engine/helpers';
import { useSession } from '../store/session';
import { recordingStatus } from '../voice/recorder';

export function Timer() {
  const startMs = useSession((s) => s.startMs);
  const phase = useSession((s) => s.phase);
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(i);
  }, []);
  const ms = phase === 'active' || phase === 'replaying' ? performance.now() - startMs : 0;
  return <b className="mono">{fmtT(ms)}</b>;
}

export function RecBadge() {
  const [st, setSt] = useState(recordingStatus());
  const phase = useSession((s) => s.phase);
  useEffect(() => {
    const i = setInterval(() => setSt(recordingStatus()), 700);
    return () => clearInterval(i);
  }, []);
  if (phase === 'replaying') return <span className="rec off">REPLAY</span>;
  const on = st === 'recorded';
  return (
    <span className={`rec ${on ? 'on' : 'off'}`} title="Application-canvas capture (MediaRecorder)">
      <i /> {on ? 'REC · canvas' : `REC ${st}`}
    </span>
  );
}
