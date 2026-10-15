import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';
import { ToneMappingMode } from 'postprocessing';
import { useEffect } from 'react';
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

export function Room({ wallZ = -0.02, width = 16, plain = false }: { wallZ?: number; width?: number; plain?: boolean }) {
  const M = mats();
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={M.floor}>
        <planeGeometry args={[width, 10]} />
      </mesh>
      <mesh position={[0, 2.6, wallZ]} receiveShadow material={plain ? M.wallPlain : M.wall}>
        <planeGeometry args={[width, 5.2]} />
      </mesh>
      {/* skirting */}
      <mesh position={[0, 0.07, wallZ + 0.02]} castShadow receiveShadow material={M.darkMetal}>
        <boxGeometry args={[width, 0.14, 0.04]} />
      </mesh>
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
