import type { PartKind } from './catalog';

export interface SlotReq {
  kind: PartKind;
  material: 'copper' | 'pvc' | 'galv';
  dia: 15 | 22;
  len?: number;
}
export interface SlotDef {
  id: string;
  label: string;
  kind: PartKind;
  len?: number; // gap length for pipe (mm)
  turn?: 'L' | 'R'; // elbow direction
  from?: string; // tee slot id when this slot sits on that tee's branch
  branch?: 'L' | 'R'; // for tee slots: which side the branch leaves
  req: SlotReq;
}
export interface SlotGeom {
  id: string;
  x: number; // mm, start port
  y: number;
  ang: number; // heading radians
  span: number; // length occupied along heading
  kind: PartKind;
  turn?: 'L' | 'R';
}

export const ELBOW_R = 34;
export const VALVE_LEN = 90;
export const TEE_LEN = 90;
export const CAP_LEN = 34;

interface Cursor {
  x: number;
  y: number;
  ang: number;
}

export function layoutRoute(slots: SlotDef[], origin = { x: 0, y: 0 }): Record<string, SlotGeom> {
  const out: Record<string, SlotGeom> = {};
  const cursors: Record<string, Cursor> = { main: { x: origin.x, y: origin.y, ang: 0 } };
  for (const s of slots) {
    const key = s.from ?? 'main';
    const c = cursors[key];
    if (!c) throw new Error('Slot order error at ' + s.id);
    const dir = { x: Math.cos(c.ang), y: Math.sin(c.ang) };
    const left = { x: -Math.sin(c.ang), y: Math.cos(c.ang) };
    let span = 0;
    const g: SlotGeom = { id: s.id, x: c.x, y: c.y, ang: c.ang, span: 0, kind: s.kind, turn: s.turn };
    switch (s.kind) {
      case 'valve':
        span = VALVE_LEN;
        c.x += dir.x * span;
        c.y += dir.y * span;
        break;
      case 'pipe':
        span = s.len ?? 200;
        c.x += dir.x * span;
        c.y += dir.y * span;
        break;
      case 'cap':
        span = CAP_LEN;
        c.x += dir.x * span;
        c.y += dir.y * span;
        break;
      case 'tee': {
        span = TEE_LEN;
        const side = s.branch === 'R' ? -1 : 1;
        cursors[s.id] = {
          x: c.x + dir.x * (span / 2) + left.x * 0,
          y: c.y + dir.y * (span / 2) + left.y * 0,
          ang: c.ang + side * (Math.PI / 2),
        };
        c.x += dir.x * span;
        c.y += dir.y * span;
        break;
      }
      case 'elbow': {
        span = ELBOW_R * 1.6;
        const sign = s.turn === 'R' ? -1 : 1;
        c.x += dir.x * ELBOW_R + sign * left.x * ELBOW_R;
        c.y += dir.y * ELBOW_R + sign * left.y * ELBOW_R;
        c.ang += sign * (Math.PI / 2);
        break;
      }
    }
    g.span = span;
    out[s.id] = g;
  }
  return out;
}

export function boundsOf(geoms: Record<string, SlotGeom>) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const g of Object.values(geoms)) {
    const ex = g.x + Math.cos(g.ang) * g.span;
    const ey = g.y + Math.sin(g.ang) * g.span;
    minX = Math.min(minX, g.x, ex);
    maxX = Math.max(maxX, g.x, ex);
    minY = Math.min(minY, g.y, ey);
    maxY = Math.max(maxY, g.y, ey);
  }
  return { minX, minY, maxX, maxY };
}
