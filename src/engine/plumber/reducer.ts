import type { ActionEvent, Scenario } from '../types';
import { part } from './catalog';
import type { SlotDef } from './layout';

export interface PlumberParams {
  slots: SlotDef[];
  tray: string[];
  initial?: Record<string, { part: string; tight: boolean }>;
  startSupply: 'open' | 'isolated';
  faultySlots?: string[]; // diagnosis scenario ground truth
  mainsBar: number;
  outletLabel: string;
}

export interface PlumberState {
  ppe: string[];
  supply: 'open' | 'isolated';
  drained: boolean;
  pressure: number;
  tool: string;
  measured: Record<string, number>;
  slots: Record<string, { part: string | null; tight: boolean }>;
  testCount: number;
  lastTest: 'none' | 'pass' | 'leak' | 'incomplete' | 'blocked';
  leaks: string[];
  flagged: string[];
  submitted: boolean;
}

export const WORK_EVENTS = ['place', 'remove', 'tighten'];

export function initialPlumber(scn: Scenario<PlumberParams>): PlumberState {
  const p = scn.params;
  const slots: PlumberState['slots'] = {};
  for (const s of p.slots) {
    const init = p.initial?.[s.id];
    slots[s.id] = { part: init?.part ?? null, tight: init?.tight ?? false };
  }
  return {
    ppe: [],
    supply: p.startSupply,
    drained: false,
    pressure: p.startSupply === 'open' ? p.mainsBar : p.mainsBar,
    tool: 'hand',
    measured: {},
    slots,
    testCount: 0,
    lastTest: 'none',
    leaks: [],
    flagged: [],
    submitted: false,
  };
}

/** Does the fitted part physically seal in its slot? (only correct + tightened joints hold pressure) */
export function slotLeaks(def: SlotDef, st: { part: string | null; tight: boolean }): boolean {
  if (!st.part) return false;
  const p = part(st.part);
  if (!st.tight) return true;
  if (p.defective) return true;
  if (p.dia !== def.req.dia) return true;
  if (p.kind !== def.req.kind) return true;
  if (def.req.kind === 'pipe' && p.len !== def.req.len) return true;
  return false;
}

export function reducePlumber(scn: Scenario<PlumberParams>, s: PlumberState, ev: ActionEvent): PlumberState {
  const n: PlumberState = {
    ...s,
    ppe: [...s.ppe],
    measured: { ...s.measured },
    slots: { ...s.slots },
    leaks: [...s.leaks],
    flagged: [...s.flagged],
  };
  const d = ev.data ?? {};
  switch (ev.type) {
    case 'ppe': {
      const item = String(d.item);
      n.ppe = d.on ? Array.from(new Set([...n.ppe, item])) : n.ppe.filter((x) => x !== item);
      break;
    }
    case 'isolate':
      n.supply = 'isolated';
      break;
    case 'restore':
      n.supply = 'open';
      n.drained = false;
      n.pressure = scn.params.mainsBar;
      break;
    case 'drain':
      if (n.supply === 'isolated') {
        n.drained = true;
        n.pressure = 0;
      }
      break;
    case 'tool':
      n.tool = String(d.tool);
      break;
    case 'measure':
      n.measured[String(ev.obj)] = Number(d.mm);
      break;
    case 'place':
      n.slots[String(ev.obj)] = { part: String(d.part), tight: false };
      break;
    case 'remove':
      n.slots[String(ev.obj)] = { part: null, tight: false };
      break;
    case 'tighten': {
      const cur = n.slots[String(ev.obj)];
      if (cur?.part) n.slots[String(ev.obj)] = { ...cur, tight: true };
      break;
    }
    case 'pressure_test': {
      if (n.supply !== 'open') {
        n.lastTest = 'blocked';
        break;
      }
      const defs = scn.params.slots;
      if (defs.some((def) => !n.slots[def.id].part)) {
        n.lastTest = 'incomplete';
        n.leaks = [];
        break;
      }
      n.leaks = defs.filter((def) => slotLeaks(def, n.slots[def.id])).map((def) => def.id);
      n.lastTest = n.leaks.length ? 'leak' : 'pass';
      n.testCount += 1;
      break;
    }
    case 'flag_leak': {
      const id = String(ev.obj);
      n.flagged = n.flagged.includes(id) ? n.flagged.filter((x) => x !== id) : [...n.flagged, id];
      break;
    }
    case 'submit':
      n.submitted = true;
      break;
    default:
      break;
  }
  return n;
}
