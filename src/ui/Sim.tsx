import { Canvas } from '@react-three/fiber';
import { scenarioById } from '../engine';
import { part } from '../engine/plumber/catalog';
import type { WelderState } from '../engine/welder/reducer';
import { labelPortal } from '../scenes/common/Label';
import { PlumberScene } from '../scenes/plumber/PlumberScene';
import { WelderScene } from '../scenes/welder/WelderScene';
import { useSession } from '../store/session';
import { RecBadge, Timer } from './SimBits';
import { InterviewerPanel } from './Interviewer';
import { PlumberHud } from './PlumberHud';
import { WelderHud } from './WelderHud';
import { FpsHud } from './FpsHud';

export default function Sim() {
  const s = useSession();
  const scn = scenarioById(s.scenarioId);
  const trade = scn.trade;
  const stW = s.state as WelderState;
  const helmet = trade === 'welder' && stW?.ppe?.includes('helmet');
  const arc = trade === 'welder' && stW?.arcOn;
  const flash = arc && !helmet;
  const live = s.phase === 'active';
  const fps = s.view === 'fps' && s.phase !== 'replaying';
  const canFps = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;

  const ghost = s.drag ? part(s.drag.part) : null;

  return (
    <div className={`sim ${fps ? 'fps' : ''}`}>
      {!fps && (
        <aside className="side left">
          <div className="card task">
            <div className="eyebrow">{scn.trade.toUpperCase()} · {scn.id.toUpperCase()}</div>
            <h2>{scn.title}</h2>
            <table className="kv">
              <tbody>
                {scn.spec.map((r) => (
                  <tr key={r.label}>
                    <th>{r.label}</th>
                    <td>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InterviewerPanel />
        </aside>
      )}

      <section className="stage">
        <div className={`canvaswrap ${arc && helmet ? 'arc-dim' : ''}`}>
          <Canvas
            key={s.quality}
            shadows={s.quality === 'high'}
            dpr={s.quality === 'high' ? [1, 1.75] : 1}
            camera={{ fov: 38, near: 0.05, far: 60, position: [0, 1.4, 4] }}
            gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
          >
            {trade === 'plumber' ? <PlumberScene /> : <WelderScene />}
          </Canvas>
        </div>
        <div className="labels" ref={(el) => {
            labelPortal.current = el;
          }} />
        {helmet && <div className="helmet-frame" />}
        {flash && (
          <div className="arc-flash">
            <b>ARC FLASH – no eye protection!</b>
          </div>
        )}
        {s.phase === 'briefing' && (
          <div className="overlay">
            <div className="brief">
              <div className="eyebrow">INTERVIEWER IS ASSIGNING YOUR TASK</div>
              <p>{s.subtitle}</p>
              <button className="primary" onClick={() => s.skipBriefing()}>
                Skip briefing → start
              </button>
            </div>
          </div>
        )}
        {s.replayInfo && (
          <div className="replay-banner">
            <b>REPLAY</b> {s.replayInfo.label} · event {s.replayInfo.index}/{s.replayInfo.total}
            <button className="mini" onClick={() => s.stopReplay()}>
              {s.replayInfo.running ? 'Stop' : 'Back to report'}
            </button>
          </div>
        )}
        {fps && <FpsHud />}
        {s.toast && <div className={`toast ${s.toast.kind}`}>{s.toast.text}</div>}
        {ghost && s.drag && (
          <div className="drag-ghost" style={{ left: s.drag.x + 14, top: s.drag.y + 10 }}>
            {ghost.label} · {ghost.sub}
          </div>
        )}
      </section>

      {!fps && <aside className="side right">{trade === 'plumber' ? <PlumberHud /> : <WelderHud />}</aside>}

      {!fps && (
        <footer className="bar">
          <span>
            ⏱ <Timer />
          </span>
          <span>
            Events <b className="mono">{s.events.length}</b>
          </span>
          <RecBadge />
          <span className="grow" />
          <span className="small">
            {s.phase === 'briefing' && 'Briefing in progress'}
            {s.phase === 'active' && 'Assessment mode · no hints'}
            {s.phase === 'replaying' && 'Replaying scripted attempt'}
          </span>
          {canFps && s.phase !== 'replaying' && (
            <button className="mini" onClick={() => s.patch({ view: 'fps' })} title="Walk the workshop with WASD + mouse">
              🎮 First-person view
            </button>
          )}
          <button
            className="primary"
            disabled={!live}
            onClick={() => {
              if (confirm('Submit for evaluation? You will not be able to change your work afterwards.')) s.submit();
            }}
          >
            ✔ Submit for evaluation
          </button>
        </footer>
      )}
    </div>
  );
}
