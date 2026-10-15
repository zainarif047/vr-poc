import type { Scenario } from './types';
import type { PlumberState } from './plumber/reducer';
import type { WelderState } from './welder/reducer';

export interface Intent {
  type: string;
  obj?: string;
  data?: Record<string, string | number | boolean>;
}
export interface GuardResult {
  intent: Intent | null; // null = blocked (no event recorded)
  toast?: { text: string; kind: 'info' | 'warn' | 'bad' | 'ok' };
}

const ok = (intent: Intent, toast?: GuardResult['toast']): GuardResult => ({ intent, toast });
const block = (text: string, kind: 'info' | 'warn' | 'bad' | 'ok' = 'warn'): GuardResult => ({ intent: null, toast: { text, kind } });

/**
 * UI-level interaction rules ("controlled interactions", proposal §4.1).
 * They only decide whether a physical action is possible. Whether it was SAFE or CORRECT is
 * never blocked here – unsafe actions are allowed and recorded so the SOP layer can flag them.
 */
export function guardPlumber(_scn: Scenario, s: PlumberState, i: Intent): GuardResult {
  switch (i.type) {
    case 'place':
      if (s.slots[String(i.obj)]?.part) return block('That position is occupied. Use the Hand tool to remove the fitted part first.');
      return ok(i);
    case 'remove':
      if (!s.slots[String(i.obj)]?.part) return block('Nothing fitted here.');
      return ok(i);
    case 'tighten': {
      if (!s.slots[String(i.obj)]?.part) return block('Nothing to tighten – fit a component first.');
      if (s.tool === 'wrench') return ok(i);
      if (s.tool === 'hammer' || s.tool === 'pliers')
        return ok({ type: 'wrong_tool', obj: i.obj, data: { tool: s.tool } }, { text: `A ${s.tool === 'hammer' ? 'hammer' : 'pair of pliers'} is not suitable for a compression fitting.`, kind: 'bad' });
      return block('Select the adjustable wrench to tighten a joint.');
    }
    case 'measure':
      if (s.tool !== 'tape') return block('Select the tape measure to measure a gap.');
      return ok(i);
    case 'flag_leak':
      if (s.tool !== 'marker') return block('Select the leak marker to tag a joint.');
      return ok(i);
    case 'drain':
      if (s.supply !== 'isolated') return block('Isolate the supply at the stopcock before draining.');
      if (s.drained) return block('The line is already drained.', 'info');
      return ok(i, { text: 'Line draining – gauge reads 0 bar.', kind: 'ok' });
    case 'isolate':
      if (s.supply === 'isolated') return block('Supply is already isolated.', 'info');
      return ok(i, { text: 'Mains stopcock closed. Trapped pressure remains until drained.', kind: 'info' });
    case 'restore':
      if (s.supply === 'open') return block('Supply is already open.', 'info');
      return ok(i, { text: 'Supply restored – pipework is pressurised.', kind: 'info' });
    case 'pressure_test':
      if (s.supply !== 'open') return block('Open the mains stopcock first – a pressure test needs supply pressure.');
      return ok(i);
    default:
      return ok(i);
  }
}

export function guardWelder(scn: Scenario, s: WelderState, i: Intent): GuardResult {
  const configured = s.wire && s.gas && s.preset;
  switch (i.type) {
    case 'tack':
      if (!configured) return block('Machine is not set up – choose wire, gas and current first.');
      if (s.tacks.includes(String(i.obj))) return block('That tack is already made.', 'info');
      return ok(i);
    case 'arc_start':
      if (!configured) return block('Machine is not set up – choose wire, gas and current first.');
      if (s.next >= 24) return block('The seam is already fully welded.', 'info');
      return ok(i);
    case 'clean':
      if (s.cleaned) return block('Joint already cleaned.', 'info');
      return ok(i);
    case 'clamp':
      if (s.clamped) return block('Coupon already clamped.', 'info');
      return ok(i);
    case 'measure_gap':
      return ok(i);
    case 'finish_weld':
      if (!s.segs.some(Boolean)) return block('Nothing has been welded yet.');
      return ok(i);
    case 'inspect_tool':
      if (!s.weldDone) return block('Finish welding before inspecting the weld.');
      return ok(i);
    case 'flag':
      if (!s.inspectTool) return block('Pick an inspection tool before marking defects.');
      return ok(i);
    case 'verdict':
      if (!s.weldDone) return block('Complete the weld before deciding accept / reject.');
      if (!s.inspectTool) return block('Inspect the weld with a tool before deciding.');
      return ok(i);
    default:
      return ok(i);
  }
}
