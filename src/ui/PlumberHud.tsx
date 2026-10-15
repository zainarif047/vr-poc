import { scenarioById } from '../engine';
import { PPE_ITEMS, TOOLS, part } from '../engine/plumber/catalog';
import type { PlumberParams, PlumberState } from '../engine/plumber/reducer';
import type { Scenario } from '../engine/types';
import { useSession } from '../store/session';

const SW: Record<string, string> = { copper: '#c77d4a', pvc: '#e9e7de', galv: '#a6adb2' };

export function PlumberHud() {
  const st = useSession((s) => s.state as PlumberState);
  const scnId = useSession((s) => s.scenarioId);
  const armed = useSession((s) => s.armed);
  const phase = useSession((s) => s.phase);
  const act = useSession((s) => s.act);
  const patch = useSession((s) => s.patch);
  const lastMeasure = useSession((s) => s.lastMeasure);
  const scn = scenarioById(scnId) as Scenario<PlumberParams>;
  const live = phase === 'active';

  return (
    <div className={`hud ${live ? '' : 'disabled'}`}>
      <section>
        <h3>PPE</h3>
        <div className="chips">
          {PPE_ITEMS.map((p) => {
            const on = st.ppe.includes(p.id);
            return (
              <button key={p.id} className={`tog ${on ? 'on' : ''}`} onClick={() => act('ppe', undefined, { item: p.id, on: !on })}>
                {p.icon} {p.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3>Parts tray</h3>
        <p className="small">Drag onto a numbered position, or tap a part then tap the position.</p>
        <div className="tray">
          {scn.params.tray.map((id) => {
            const p = part(id);
            return (
              <button
                key={id}
                className={`part ${armed === id ? 'on' : ''}`}
                onPointerDown={(e) => {
                  if (!live || e.button !== 0) return;
                  patch({ drag: { part: id, x: e.clientX, y: e.clientY } });
                }}
                onClick={() => live && patch({ armed: armed === id ? null : id })}
              >
                <i style={{ background: SW[p.material] }} />
                <b>{p.label}</b>
                <small>{p.sub}</small>
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <h3>Tools</h3>
        <div className="tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              title={t.sub}
              className={`tool ${st.tool === t.id ? 'on' : ''}`}
              onClick={() => {
                patch({ armed: null });
                act('tool', undefined, { tool: t.id });
              }}
            >
              <span className="ico">{t.icon}</span>
              <span>
                <b>{t.label}</b>
                <small>{t.sub}</small>
              </span>
            </button>
          ))}
        </div>
        {lastMeasure && <div className="note">📏 Last reading: position {lastMeasure.id.replace('s', '')} = <b>{lastMeasure.mm} mm</b></div>}
      </section>

      <section>
        <h3>Supply &amp; pressure</h3>
        <div className="readout">
          <span>Supply</span>
          <b className={st.supply === 'open' ? 'warn' : 'ok'}>{st.supply === 'open' ? 'OPEN · live' : 'ISOLATED'}</b>
          <span>Gauge</span>
          <b>{st.pressure.toFixed(1)} bar</b>
        </div>
        <div className="row">
          <button className="mini" onClick={() => act(st.supply === 'open' ? 'isolate' : 'restore')}>
            {st.supply === 'open' ? '⛔ Isolate supply' : '💧 Restore supply'}
          </button>
          <button className="mini" onClick={() => act('drain')}>
            ⬇ Drain line
          </button>
        </div>
        <button className="primary wide" onClick={() => act('pressure_test')}>
          ▶ Run pressure test
        </button>
        {st.lastTest !== 'none' && (
          <div className={`result ${st.lastTest}`}>
            {st.lastTest === 'pass' && 'Last test: PASS – no leaks'}
            {st.lastTest === 'leak' && `Last test: LEAK at ${st.leaks.length} joint(s)`}
            {st.lastTest === 'incomplete' && 'Last test: not run – route incomplete'}
            {st.lastTest === 'blocked' && 'Last test: not run – supply closed'}
          </div>
        )}
      </section>

    </div>
  );
}
