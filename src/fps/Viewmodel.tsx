import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { GRIP, Hand } from './models';
import { isLocked, rt, useFps } from './runtime';

const R_BASE = new THREE.Vector3(0.2, -0.19, -0.34);
const L_BASE = new THREE.Vector3(-0.23, -0.26, -0.36);

export interface HeldItem {
  node: ReactNode;
  rot?: [number, number, number];
  pos?: [number, number, number];
  scale?: number;
  twist?: boolean; // roll the wrist while a hold action runs (wrench, brush)
}

/**
 * Camera-attached hands. Kept within ~0.4 m of the eye so they never clip into walls
 * (the player body radius is larger than the reach of the viewmodel).
 */
export function Viewmodel({ item, glove, sleeve, hideRight = false }: { item: HeldItem | null; glove: string; sleeve: string; hideRight?: boolean | (() => boolean) }) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const right = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const lower = useRef(0);

  useEffect(() => {
    scene.add(camera);
    return () => void scene.remove(camera);
  }, [camera, scene]);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    const fs = useFps.getState();
    const down = !isLocked() || !!fs.modal ? 1 : 0;
    lower.current += (down - lower.current) * Math.min(1, dt * 8);
    const bx = Math.sin(rt.bob) * 0.007 * rt.moveAmt;
    const by = -Math.abs(Math.sin(rt.bob)) * 0.009 * rt.moveAmt;
    const pt = (performance.now() - rt.punch) / 220;
    const punch = pt < 1 ? Math.sin(Math.PI * pt) : 0;
    const hold = fs.hold?.progress ?? 0;
    const jitter = fs.welding ? (Math.random() - 0.5) * 0.003 : 0;
    if (right.current) {
      right.current.visible = !(typeof hideRight === 'function' ? hideRight() : hideRight);
      right.current.position.set(
        R_BASE.x + bx - rt.sway.x * 0.6 + jitter,
        R_BASE.y + by + rt.sway.y * 0.6 - lower.current * 0.16 + jitter,
        R_BASE.z - punch * 0.06 + hold * -0.02,
      );
      right.current.rotation.set(0.06 + punch * 0.15, -0.14 - rt.sway.x * 2, 0.06 + (item?.twist ? -hold * 0.9 : 0));
    }
    if (left.current) {
      left.current.position.set(L_BASE.x - bx * 0.6 - rt.sway.x * 0.5, L_BASE.y + by * 0.8 + rt.sway.y * 0.5 - lower.current * 0.16, L_BASE.z);
      left.current.rotation.set(0.25, 0.3 - rt.sway.x * 2, -0.25);
    }
  });

  return createPortal(
    <group>
      <group ref={right} position={R_BASE.toArray()}>
        <Hand pose={item ? 'grip' : 'open'} glove={glove} sleeve={sleeve} />
        {item && (
          <group position={item.pos ?? GRIP} rotation={item.rot ?? [-0.95, 0, 0]} scale={item.scale ?? 1}>
            {item.node}
          </group>
        )}
      </group>
      <group ref={left} position={L_BASE.toArray()}>
        <Hand pose="open" glove={glove} sleeve={sleeve} mirror />
      </group>
    </group>,
    camera,
  );
}
