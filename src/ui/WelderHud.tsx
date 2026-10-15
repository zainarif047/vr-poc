import { useEffect, useRef, useState } from 'react';
import { scenarioById } from '../engine';
import type { Scenario } from '../engine/types';
import {
  DEFECT_LABEL,
  DEFECT_TYPES,
  FLAMMABLE_LABEL,
  GASES,
  PPE_ITEMS,
  PRESETS,
  WIRES,
  type WelderParams,
  type WelderState,
} from '../engine/welder/reducer';
import { useSession } from '../store/session';

function Range({ label, unit, value, min, max, step, onCommit }: { label: string; unit: string; value: number; min: number; max: number; step: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <div className="range">
      <label>
        {label} <b>{v}{unit}</b>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={(e) => {
          const nv = Number((e.target as HTMLInputElement).value);
          if (nv !== value) onCommit(nv);
        }}
        onKeyUp={(e) => {
          const nv = Number((e.target as HTMLInputElement).value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => nv !== value && onCommit(nv), 500);
        }}
      />
    </div>
  );
}

export function WelderHud() {
  const st = useSession((s) => s.state as WelderState);
  const scnId = useSession((s) => s.scenarioId);
  const phase = useSession((s) => s.phase);
  const act = useSession((s) => s.act);
  const patch = useSession((s) => s.patch);
  const speed = useSession((s) => s.liveSpeed);
  const defectType = useSession((s) => s.defectType);
  const toast = useSession((s) => s.toastMsg);
  const scn = scenarioById(scnId) as Scenario<WelderParams>;
  const p = scn.params;
  const live = phase === 'active';
  const inspectOnly = p.mode === 'inspect';
  const [gapReading, setGapReading] = useState<number | null>(null);
  useEffect(() => setGapReading(st.gap), [st.gap]);
  const ppeList = inspectOnly ? PPE_ITEMS.filter((x) => ['glasses', 'gloves', 'sunglasses', 'knit'].includes(x.id)) : PPE_ITEMS;

  return (
    <div className={`hud ${live ? '' : 'disabled'}`}>
      <section>
        <h3>PPE rack</h3>
        <div className="chips">
          {ppeList.map((x) => {
            const on = st.ppe.includes(x.id);
            return (
              <button key={x.id} className={`tog ${on ? 'on' : ''}`} onClick={() => act('ppe', undefined, { item: x.id, on: !on })}>
                {x.icon} {x.label}
              </button>
            );
          })}
        </div>
      </section>

      {!inspectOnly && (
        <>
          <section>
            <h3>Work area</h3>
            <div className="chips">
              <button className={`tog ${st.vent ? 'on' : ''}`} onClick={() => act('vent', undefined, { on: !st.vent })}>
                🌀 Fume extraction {st.vent ? 'ON' : 'OFF'}
              </button>
              <button className={`tog ${st.extinguisher ? 'on' : ''}`} onClick={() => act('extinguisher')}>
                🧯 Check extinguisher
              </button>
            </div>
            {p.flammables.length > 0 && (
              <div className="chips" style={{ marginTop: 8 }}>
                {p.flammables.map((f) => (
                  <button key={f} className={`tog ${st.cleared.includes(f) ? 'on' : ''}`} onClick={() => act('clear', f)}>
                    {st.cleared.includes(f) ? '✓ ' : '🔥 '}
                    {FLAMMABLE_LABEL[f]} {st.cleared.includes(f) ? 'removed' : '– move away'}
                  </button>
                ))}
              </div>
            )}
            <p className="small">You can also click hazards, the extractor and the extinguisher directly in the 3D view.</p>
          </section>

          <section>
            <h3>Machine setup</h3>
            <label className="sel">
              Filler wire
              <select value={st.wire ?? ''} onChange={(e) => act('set_wire', undefined, { v: e.target.value })}>
                <option value="" disabled>
                  — select —
                </option>
                {WIRES.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sel">
              Shielding gas
              <select value={st.gas ?? ''} onChange={(e) => act('set_gas', undefined, { v: e.target.value })}>
                <option value="" disabled>
                  — select —
                </option>
                {GASES.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sel">
              Current / voltage preset
              <select value={st.preset ?? ''} onChange={(e) => act('set_preset', undefined, { v: e.target.value })}>
                <option value="" disabled>
                  — select —
                </option>
                {PRESETS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <Range label="Gas flow" unit=" L/min" value={st.flow} min={4} max={30} step={1} onCommit={(v) => act('set_flow', undefined, { v })} />
            <Range label="Torch angle" unit="°" value={st.angle} min={0} max={60} step={1} onCommit={(v) => act('set_angle', undefined, { v })} />
          </section>

          <section>
            <h3>Joint preparation</h3>
            <div className="chips">
              <button className={`tog ${st.cleaned ? 'on' : ''}`} onClick={() => act('clean')}>
                🧽 Wire-brush joint
              </button>
              <button
                className={`tog ${gapReading !== null ? 'on' : ''}`}
                onClick={() => {
                  if (act('measure_gap', undefined, { mm: p.fitGap })) setGapReading(p.fitGap);
                }}
              >
                📏 Measure fit-up gap{gapReading !== null ? ` · ${gapReading.toFixed(1)} mm` : ''}
              </button>
              <button className={`tog ${st.clamped ? 'on' : ''}`} onClick={() => act('clamp')}>
                🗜 Clamp coupon
              </button>
            </div>
            <div className="row">
              {[
                ['s', 'Tack start'],
                ['m', 'Tack mid'],
                ['e', 'Tack end'],
              ].map(([id, label]) => (
                <button key={id} className={`mini ${st.tacks.includes(id) ? 'on' : ''}`} onClick={() => act('tack', id)}>
                  ⚡ {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Weld pass</h3>
            <div className="speed">
              <span>Travel speed (sim time ×2)</span>
              <b>{speed.toFixed(1)} mm/s</b>
              <div className="bar">
                <i style={{ width: `${Math.min(100, (speed / 14) * 100)}%` }} />
              </div>
            </div>
            <div className="readout">
              <span>Deposited</span>
              <b>
                {st.segs.filter(Boolean).length}/{st.segs.length}
              </b>
              <span>Arc</span>
              <b className={st.arcOn ? 'warn' : ''}>{st.arcOn ? 'ON' : 'off'}</b>
            </div>
            <button className="mini wide" onClick={() => act('finish_weld')}>
              ■ Finish weld (stop early)
            </button>
          </section>
        </>
      )}

      <section>
        <h3>Inspection</h3>
        <div className="chips">
          {[
            ['gauge', '📐 Weld gauge'],
            ['magnifier', '🔍 Magnifier'],
          ].map(([id, label]) => (
            <button key={id} className={`tog ${st.inspectTool === id ? 'on' : ''}`} onClick={() => act('inspect_tool', undefined, { tool: id })}>
              {label}
            </button>
          ))}
        </div>
        <label className="sel">
          Defect type to mark
          <select value={defectType} onChange={(e) => patch({ defectType: e.target.value })}>
            {DEFECT_TYPES.map((d) => (
              <option key={d} value={d}>
                {DEFECT_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <p className="small">Click along the weld in the 3D view to mark / unmark a defect. Marked: {st.flags.length}</p>
        <div className="row">
          <button className={`mini ${st.verdict === 'accept' ? 'on' : ''}`} onClick={() => act('verdict', undefined, { v: 'accept' })}>
            ✔ Accept weld
          </button>
          <button className={`mini ${st.verdict === 'reject' ? 'on bad' : ''}`} onClick={() => act('verdict', undefined, { v: 'reject' })}>
            ✖ Reject weld
          </button>
        </div>
        {inspectOnly ? null : (
          <button className="link" onClick={() => toast('Acceptance: ' + p.acceptance, 'info')}>
            Show acceptance table
          </button>
        )}
      </section>
    </div>
  );
}
