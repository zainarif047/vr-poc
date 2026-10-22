import { useRef } from 'react';
import type * as THREE from 'three';
import { mats } from '../scenes/common/materials';
import { useBlocker, useInteractable, type SpecFn } from './runtime';

type V3 = [number, number, number];

/** Invisible box that the crosshair can focus (bigger and steadier than thin meshes). */
export function Hit({ size, position, rotation, spec, enabled }: { size: V3; position: V3; rotation?: V3; spec: SpecFn; enabled: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useInteractable(ref, spec, enabled);
  return (
    <mesh ref={ref} position={position} rotation={rotation} material={mats().invisible}>
      <boxGeometry args={size} />
    </mesh>
  );
}

/** Invisible box that stops the interaction ray. */
export function Block({ size, position, enabled }: { size: V3; position: V3; enabled: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useBlocker(ref, enabled);
  return (
    <mesh ref={ref} position={position} material={mats().invisible}>
      <boxGeometry args={size} />
    </mesh>
  );
}
