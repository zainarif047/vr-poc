import { lazy, Suspense } from 'react';
import { useSession, type Screen } from './store/session';
import { CheckIn } from './ui/CheckIn';
import { Coverage } from './ui/Coverage';
import { FollowUp, Evaluating } from './ui/FollowUp';
import { History } from './ui/History';
import { Lab } from './ui/Lab';
import { Report } from './ui/Report';

const Sim = lazy(() => import('./ui/Sim'));

const NAV: { id: Screen; label: string }[] = [
  { id: 'checkin', label: 'Assessment' },
  { id: 'lab', label: 'SOP Validation Lab' },
  { id: 'coverage', label: 'Proposal coverage' },
  { id: 'history', label: 'History' },
];

export default function App() {
  const screen = useSession((s) => s.screen);
  const phase = useSession((s) => s.phase);
  const setScreen = useSession((s) => s.setScreen);
  const resetToCheckin = useSession((s) => s.resetToCheckin);
  const inSession = ['sim', 'followup', 'evaluating'].includes(screen);

  const go = (id: Screen) => {
    if (inSession && phase !== 'replaying' && !confirm('Leave the live assessment? The attempt in progress will be discarded.')) return;
    if (id === 'checkin') resetToCheckin();
    else setScreen(id);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          ARTILENCE<span> / </span>
          <em>Skills Lab 3D</em>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`navbtn ${screen === n.id || (n.id === 'checkin' && inSession) ? 'on' : ''}`}
              onClick={() => go(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="pill">PHASE 1 · PROOF OF CONCEPT</div>
      </header>
      <main className={`screen screen-${screen}`}>
        {screen === 'checkin' && <CheckIn />}
        {screen === 'sim' && (
          <Suspense fallback={<div className="loading">Loading 3D workshop…</div>}>
            <Sim />
          </Suspense>
        )}
        {screen === 'followup' && <FollowUp />}
        {screen === 'evaluating' && <Evaluating />}
        {screen === 'report' && <Report />}
        {screen === 'lab' && <Lab />}
        {screen === 'coverage' && <Coverage />}
        {screen === 'history' && <History />}
      </main>
    </div>
  );
}
