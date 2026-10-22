import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useBlocker } from '../../fps/runtime';
import { mats } from './materials';
import { startRecording } from '../../voice/recorder';
import { useSession } from '../../store/session';

export function RecorderBridge() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {

    if (useSession.getState().phase !== 'replaying') startRecording(gl.domElement);
  }, [gl]);
  return null;
}

export interface RoomBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const CEIL = 3.4;

/**
 * Workshop shell. The back wall sits at `box.minZ`. Closed mode (first-person) adds side walls,
 * the front wall and a ceiling with light panels; the classic orbit camera needs it open.
 */
export function Workshop({ box, plain = false, closed }: { box: RoomBox; plain?: boolean; closed: boolean }) {
  const M = mats();
  const w = box.maxX - box.minX;
  const d = box.maxZ - box.minZ;
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const back = useRef<THREE.Mesh>(null);
  const walls = useRef<THREE.Group>(null);
  useBlocker(back, closed);
  useBlocker(walls, closed);
  const fw = closed ? w : w + 10;
  const fd = closed ? d : d + 8;
  return (
    <group>
      <mesh position={[cx, 0, closed ? cz : cz + 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={M.floor}>
        <planeGeometry args={[fw, fd]} />
      </mesh>
      <mesh ref={back} position={[cx, 2.6, box.minZ]} receiveShadow material={plain ? M.wallPlain : M.wall}>
        <planeGeometry args={[closed ? w : 16, 5.2]} />
      </mesh>
      <mesh position={[cx, 0.07, box.minZ + 0.02]} castShadow receiveShadow material={M.darkMetal}>
        <boxGeometry args={[closed ? w : 16, 0.14, 0.04]} />
      </mesh>
      {closed && (
        <group ref={walls}>
          <mesh position={[box.minX, CEIL / 2, cz]} rotation={[0, Math.PI / 2, 0]} receiveShadow material={M.wallPlain}>
            <planeGeometry args={[d, CEIL]} />
          </mesh>
          <mesh position={[box.maxX, CEIL / 2, cz]} rotation={[0, -Math.PI / 2, 0]} receiveShadow material={M.wallPlain}>
            <planeGeometry args={[d, CEIL]} />
          </mesh>
          <mesh position={[cx, CEIL / 2, box.maxZ]} rotation={[0, Math.PI, 0]} receiveShadow material={M.wallPlain}>
            <planeGeometry args={[w, CEIL]} />
          </mesh>
          <mesh position={[cx, CEIL, cz]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w, d]} />
            <meshStandardMaterial color="#1b2230" roughness={0.9} />
          </mesh>
          {[box.minX, box.maxX].map((x, i) => (
            <mesh key={i} position={[x + (i ? -0.02 : 0.02), 0.07, cz]} material={M.darkMetal}>
              <boxGeometry args={[0.04, 0.14, d]} />
            </mesh>
          ))}
          {[0.3, 0.7].flatMap((fz) =>
            [0.3, 0.7].map((fx) => (
              <mesh key={`${fx}${fz}`} position={[box.minX + w * fx, CEIL - 0.03, box.minZ + d * fz]} rotation={[Math.PI / 2, 0, 0]}>
                <planeGeometry args={[1.4, 0.18]} />
                <meshBasicMaterial color="#eef5ff" toneMapped={false} side={THREE.DoubleSide} />
              </mesh>
            )),
          )}
        </group>
      )}
    </group>
  );
}

export function Lights({ bloom = true }: { bloom?: boolean }) {
  const high = useSession((s) => s.quality) === 'high';
  return (
    <>
      <color attach="background" args={['#0a0e15']} />
      <fog attach="fog" args={['#0a0e15', 7, 16]} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={5} position={[0, 5.5, 2.5]} rotation-x={Math.PI / 2} scale={[9, 4, 1]} />
        <Lightformer form="rect" intensity={2.6} position={[-5, 2.4, 3]} rotation-y={Math.PI / 2} scale={[5, 3.4, 1]} />
        <Lightformer form="rect" intensity={2.2} position={[5, 2.2, 3]} rotation-y={-Math.PI / 2} scale={[5, 3.4, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#9fc2ff" position={[0, 1.2, 6]} scale={[10, 2, 1]} />
      </Environment>
      <ambientLight intensity={0.5} />
      <directionalLight
        castShadow={high}
        position={[2.4, 4.6, 3.8]}
        intensity={2.4}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-1}
        shadow-camera-near={0.5}
        shadow-camera-far={14}
        shadow-bias={-0.0004}
      />
      <spotLight position={[-3, 3.4, 2.4]} angle={0.7} penumbra={0.9} intensity={26} color="#cfe0ff" />
      {high ? (
        <EffectComposer multisampling={4}>
          {bloom ? <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.92} luminanceSmoothing={0.2} /> : <></>}
          <Vignette eskil={false} offset={0.25} darkness={0.55} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      ) : null}
    </>
  );
}

export function Controls({ target, minDistance = 1.4, maxDistance = 6 }: { target: [number, number, number]; minDistance?: number; maxDistance?: number }) {
  return (
    <OrbitControls
      target={target}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={0.55}
      maxPolarAngle={1.62}
      minAzimuthAngle={-0.95}
      maxAzimuthAngle={0.95}
      rotateSpeed={0.6}
      makeDefault
    />
  );
}
