import { Hit } from '../../fps/Hit';
import { openModal } from '../../fps/runtime';
import { mats } from './materials';

/** Clipboard with the task specification; E opens the job-card panel in first-person mode. */
export function JobCard({ position, fps, rotation }: { position: [number, number, number]; rotation?: [number, number, number]; fps: boolean }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[0.24, 0.32, 0.012]} />
        <meshStandardMaterial color="#7a5533" roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.015, 0.007]}>
        <planeGeometry args={[0.2, 0.26]} />
        <meshStandardMaterial color="#f1efe8" roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[-0.01, 0.06 - i * 0.04, 0.008]}>
          <planeGeometry args={[0.15 - (i % 2) * 0.04, 0.008]} />
          <meshBasicMaterial color="#8d96a3" />
        </mesh>
      ))}
      <mesh position={[0, 0.15, 0.012]} material={mats().steel}>
        <boxGeometry args={[0.08, 0.03, 0.014]} />
      </mesh>
      <Hit
        size={[0.3, 0.38, 0.1]}
        position={[0, 0, 0.02]}
        enabled={fps}
        spec={() => ({ id: 'jobcard', title: 'Job card', sub: 'Task specification', actions: [{ key: 'E', label: 'Read job card', run: () => openModal('jobcard') }] })}
      />
    </group>
  );
}
