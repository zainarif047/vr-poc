import { useEffect } from 'react';
import { scenarioById } from '../engine';
import { PPE_ITEMS as PLUMBER_PPE, TOOLS, part } from '../engine/plumber/catalog';
import type { PlumberState } from '../engine/plumber/reducer';
import type { Scenario } from '../engine/types';
import { DEFECT_LABEL, PPE_ITEMS as WELDER_PPE, SEGMENTS, type DefectType, type WelderParams, type WelderState } from '../engine/welder/reducer';
import { KEY_LABEL, closeModal, requestLock, setSens, useFps } from '../fps/runtime';
import { HAND_TOOLS } from '../scenes/welder/WelderStations';
import { useSession } from '../store/session';
import { cancelSpeech } from '../voice/tts';
import { Avatar } from './Interviewer';
import { RecBadge, Timer } from './SimBits';
import { MachineSetup } from './WelderHud';

const NONE: string[] = [];

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look around'],
  ['Shift', 'Walk faster'],
  ['C', 'Crouch / stand'],
  ['F', 'Pick up · put on · take'],
  ['E', 'Use – valves, panels, machine, job card'],
  ['Click', 'Use the tool in your hand · fit a part'],
  ['Hold click', 'Tighten a joint · weld'],
  ['Right-click', 'Tack weld'],
  ['1–6 / wheel', 'Switch tool (plumbing)'],
  ['R / wheel', 'Change defect type (inspection)'],
  ['Q', 'Put the item in your hand away'],
  ['H', 'Show / hide controls'],
  ['Esc', 'Pause and free the mouse'],
];

function ControlsGrid() {
  return (
    <div className="fp-keys">
      {CONTROLS.map(([k, v]) => (
        <div key={k}>
          <kbd>{k}</kbd>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

function submitAttempt() {
  if (confirm('Submit for evaluation? You will not be able to change your work afterwards.')) {
    useFps.setState({ modal: null });
    useSession.getState().submit();
  }
}

// ───────────────────────── prompt + crosshair ─────────────────────────
function Crosshair() {
  const prompt = useFps((s) => s.prompt);
  const hold = useFps((s) => s.hold);
  const welding = useFps((s) => s.welding);
  const active = !!prompt?.actions.length;
  const C = 2 * Math.PI * 15;
  return (
    <>
      <div className={`fp-cross ${active ? 'on' : ''} ${welding ? 'weld' : ''}`}>
        <i />
        {hold && (
          <svg viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="15" strokeDasharray={`${C * hold.progress} ${C}`} />
          </svg>
        )}
      </div>
      {prompt && !welding && (
        <div className={`fp-prompt ${prompt.tone ?? ''}`}>
          <b>{prompt.title}</b>
          {prompt.sub && <small>{prompt.sub}</small>}
          {prompt.actions.map((a) => (
            <div key={a.key + a.label} className="fp-act">
              <kbd>{KEY_LABEL[a.key]}</kbd> {a.label}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ───────────────────────── trade panels ─────────────────────────
function PlumberBar() {
  const st = useSession((s) => s.state as PlumberState);
  const armed = useSession((s) => s.armed);
  const lastMeasure = useSession((s) => s.lastMeasure);
  const belt = useFps((s) => s.belt);
  const slots = ['hand', ...belt];
  const res = { none: '—', pass: 'PASS', leak: `LEAK × ${st.leaks.length}`, incomplete: 'not run · incomplete', blocked: 'not run · supply closed' }[st.lastTest];
  return (
    <>
      <div className="fp-status">
        <div className="eyebrow">PLUMBING BAY</div>
        <div className="fp-row">
          <span>Supply</span>
          <b className={st.supply === 'open' ? 'warn' : 'ok'}>{st.supply === 'open' ? 'OPEN · live' : 'ISOLATED'}</b>
        </div>
        <div className="fp-row">
          <span>Gauge</span>
          <b>{st.pressure.toFixed(1)} bar</b>
        </div>
        <div className="fp-row">
          <span>Last test</span>
          <b className={st.lastTest === 'pass' ? 'ok' : st.lastTest === 'leak' ? 'bad' : ''}>{res}</b>
        </div>
        {lastMeasure && (
          <div className="fp-row">
            <span>Last reading</span>
            <b>
              pos {lastMeasure.id.replace('s', '')} · {lastMeasure.mm} mm
            </b>
          </div>
        )}
        <div className="fp-ppe">
          {PLUMBER_PPE.filter((p) => st.ppe.includes(p.id)).map((p) => (
            <span key={p.id} title={p.label}>
              {p.icon}
            </span>
          ))}
          {!st.ppe.length && <em>No PPE worn</em>}
        </div>
      </div>
      <div className="fp-hotbar">
        {armed && (
          <div className="fp-inhand">
            In hand: <b>{part(armed).label}</b> · {part(armed).sub} <kbd>Q</kbd> put back
          </div>
        )}
        <div className="fp-slots">
          {slots.map((id, i) => {
            const t = TOOLS.find((x) => x.id === id)!;
            return (
              <div key={id} className={`fp-slot ${!armed && st.tool === id ? 'on' : ''}`} title={t.label}>
                <small>{i + 1}</small>
                <span>{t.icon}</span>
                <em>{t.label}</em>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function WelderBar({ p }: { p: WelderParams }) {
  const st = useSession((s) => s.state as WelderState);
  const speed = useSession((s) => s.liveSpeed);
  const defectType = useSession((s) => s.defectType);
  const held = useFps((s) => s.held);
  const welding = useFps((s) => s.welding);
  const inspecting = held === 'gauge' || held === 'magnifier';
  return (
    <>
      <div className="fp-status">
        <div className="eyebrow">WELDING BAY</div>
        {p.mode === 'full' && (
          <>
            <div className="fp-row">
              <span>Machine</span>
              <b>{st.wire && st.gas && st.preset ? `${st.preset.slice(1)} A · ${st.flow} L/min · ${st.angle}°` : 'not set up'}</b>
            </div>
            <div className="fp-row">
              <span>Deposited</span>
              <b>
                {st.segs.filter(Boolean).length}/{SEGMENTS} · tacks {st.tacks.length}
              </b>
            </div>
            <div className="fp-row">
              <span>Arc</span>
              <b className={st.arcOn ? 'warn' : ''}>{st.arcOn ? 'ON' : 'off'}</b>
            </div>
            {(welding || speed > 0) && (
              <div className="speed">
                <span>Travel speed (sim time ×2)</span>
                <b>{speed.toFixed(1)} mm/s</b>
                <div className="bar">
                  <i style={{ width: `${Math.min(100, (speed / 14) * 100)}%` }} />
                </div>
              </div>
            )}
          </>
        )}
        <div className="fp-row">
          <span>Marked defects</span>
          <b>{st.flags.length}</b>
        </div>
        <div className="fp-row">
          <span>Verdict</span>
          <b>{st.verdict ?? '—'}</b>
        </div>
        <div className="fp-ppe">
          {WELDER_PPE.filter((x) => st.ppe.includes(x.id)).map((x) => (
            <span key={x.id} title={x.label}>
              {x.icon}
            </span>
          ))}
          {!st.ppe.length && <em>No PPE worn</em>}
        </div>
      </div>
      <div className="fp-hotbar">
        {held ? (
          <div className="fp-inhand">
            In hand: <b>{HAND_TOOLS[held].label}</b>
            {inspecting && (
              <>
                {' '}
                · marking <b>{DEFECT_LABEL[defectType as DefectType]}</b> <kbd>R</kbd>
              </>
            )}{' '}
            <kbd>Q</kbd> put away
          </div>
        ) : (
          <div className="fp-inhand muted">Hands empty</div>
        )}
      </div>
    </>
  );
}

// ───────────────────────── modals ─────────────────────────
function JobCardModal({ scn }: { scn: Scenario }) {
  const act = useSession((s) => s.act);
  const st = useSession((s) => s.state);
  const welder = scn.trade === 'welder' ? (scn.params as WelderParams) : null;
  const w = st as WelderState;
  return (
    <div className="fp-modal">
      <div className="card">
        <div className="eyebrow">JOB CARD · {scn.id.toUpperCase()}</div>
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
            {welder && (
              <tr>
                <th>Acceptance</th>
                <td>{welder.acceptance}</td>
              </tr>
            )}
          </tbody>
        </table>
        {welder && (
          <div className="fp-jobacts">
            {welder.mode === 'full' && (
              <button className="mini" onClick={() => act('finish_weld')}>
                ■ Mark weld complete (stop early)
              </button>
            )}
            <button className={`mini ${w.verdict === 'accept' ? 'on' : ''}`} onClick={() => act('verdict', undefined, { v: 'accept' })}>
              ✔ Accept weld
            </button>
            <button className={`mini ${w.verdict === 'reject' ? 'on bad' : ''}`} onClick={() => act('verdict', undefined, { v: 'reject' })}>
              ✖ Reject weld
            </button>
          </div>
        )}
        <div className="row fp-modal-foot">
          <button className="primary" onClick={() => closeModal()}>
            Back to the workshop
          </button>
          <button onClick={submitAttempt}>✔ Submit for evaluation</button>
        </div>
      </div>
    </div>
  );
}

function MachineModal() {
  return (
    <div className="fp-modal">
      <div className="card">
        <div className="eyebrow">MIG MACHINE · SET-UP PANEL</div>
        <h2>Machine settings</h2>
        <MachineSetup />
        <div className="row fp-modal-foot">
          <button className="primary" onClick={() => closeModal()}>
            Done – back to the workshop
          </button>
        </div>
      </div>
    </div>
  );
}

function PauseMenu({ scn }: { scn: Scenario }) {
  const entered = useFps((s) => s.entered);
  const lockError = useFps((s) => s.lockError);
  const sens = useFps((s) => s.sens);
  const voiceOn = useSession((s) => s.voiceOn);
  const patch = useSession((s) => s.patch);
  return (
    <div className="fp-pause" onClick={() => requestLock()}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">{scn.trade === 'plumber' ? 'PLUMBING BAY' : 'WELDING BAY'} · FIRST-PERSON MODE</div>
        <h2>{entered ? 'Paused' : 'Enter the workshop'}</h2>
        <p>{entered ? 'The timer keeps running while paused.' : 'Walk the bay, pick up what you need and complete the task. Assessment mode – no hints.'}</p>
        <ControlsGrid />
        <div className="range">
          <label>
            Mouse sensitivity <b>{sens.toFixed(1)}×</b>
          </label>
          <input type="range" min={0.3} max={2.5} step={0.1} value={sens} onChange={(e) => setSens(Number(e.target.value))} />
        </div>
        {lockError && <p className="warn">{lockError}</p>}
        <div className="row fp-modal-foot">
          <button className="primary big" onClick={() => requestLock()}>
            {entered ? '▶ Resume' : '▶ Click to enter'}
          </button>
        </div>
        <div className="row">
          <button className="mini" onClick={() => useFps.setState({ modal: 'jobcard' })}>
            📋 Job card
          </button>
          <button
            className="mini"
            onClick={() => {
              patch({ voiceOn: !voiceOn });
              if (voiceOn) cancelSpeech();
            }}
          >
            {voiceOn ? '🔊 Voice on' : '🔇 Voice off'}
          </button>
          <button className="mini" onClick={() => patch({ view: 'classic' })}>
            🖱 Switch to classic view
          </button>
          <button className="mini" onClick={submitAttempt}>
            ✔ Submit for evaluation
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── root ─────────────────────────
export function FpsHud() {
  const scnId = useSession((s) => s.scenarioId);
  const scn = scenarioById(scnId);
  const phase = useSession((s) => s.phase);
  const speaking = useSession((s) => s.speaking);
  const subtitle = useSession((s) => s.subtitle);
  const events = useSession((s) => s.events.length);
  const ppe = useSession((s) => (s.state?.ppe as string[] | undefined) ?? NONE);
  const locked = useFps((s) => s.locked);
  const modal = useFps((s) => s.modal);
  const help = useFps((s) => s.help);
  const crouch = useFps((s) => s.crouch);
  const live = phase === 'active';

  // Esc cannot re-capture the mouse (browsers do not treat it as a user gesture), so it falls back to the pause menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && useFps.getState().modal) useFps.setState({ modal: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fp-hud">
      {ppe.includes('sunglasses') && <div className="fp-tint" />}
      {ppe.includes('glasses') && <div className="fp-glasses" />}
      <div className="fp-top">
        <div className="fp-task">
          <span className="eyebrow">
            {scn.trade.toUpperCase()} · {scn.id.toUpperCase()}
          </span>
          <b>{scn.title}</b>
        </div>
        {speaking && subtitle && (
          <div className="fp-sub">
            <Avatar speaking />
            <span>{subtitle}</span>
          </div>
        )}
        <div className="fp-meta">
          ⏱ <Timer />
          <span>
            Events <b className="mono">{events}</b>
          </span>
          <RecBadge />
          {crouch && <span className="fp-tag">CROUCHED</span>}
        </div>
      </div>
      {live && locked && !modal && <Crosshair />}
      {live && (scn.trade === 'plumber' ? <PlumberBar /> : <WelderBar p={scn.params as WelderParams} />)}
      <div className="fp-vr">
        🥽 <b>Coming soon:</b> VR headset &amp; hand controllers for the full experience
      </div>
      {live && locked && !modal && !help && (
        <div className="fp-hint">
          <kbd>H</kbd> controls · <kbd>Esc</kbd> pause
        </div>
      )}
      {help && locked && !modal && (
        <div className="fp-help card">
          <div className="eyebrow">CONTROLS</div>
          <ControlsGrid />
        </div>
      )}
      {live && !locked && !modal && <PauseMenu scn={scn} />}
      {live && modal === 'jobcard' && <JobCardModal scn={scn} />}
      {live && modal === 'machine' && <MachineModal />}
    </div>
  );
}
