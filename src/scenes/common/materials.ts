import * as THREE from 'three';
import { brickSet, brushedSet, concreteSet, gaugeDial, scaleSet } from './textures';

let cache: ReturnType<typeof build> | null = null;

function build() {
  const copperMaps = brushedSet([205, 125, 78], [3, 1]);
  const brassMaps = brushedSet([214, 170, 80], [2, 1]);
  const steelMaps = brushedSet([170, 176, 184], [3, 3]);
  const plateMaps = scaleSet([178, 186, 198], [1, 1], 10, 0.32);
  const tableMaps = scaleSet([66, 72, 82], [4, 2], 14, 0.2);
  const plain = concreteSet([5, 2]);
  const cleanMaps = brushedSet([196, 202, 210], [2, 1]);
  const floor = concreteSet([8, 6]);
  const wall = brickSet([12, 4]);

  const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial({ envMapIntensity: 1.1, ...o });
  return {
    copper: phys({
      color: '#ffffff',
      map: copperMaps.map,
      roughnessMap: copperMaps.rough,
      bumpMap: copperMaps.bump,
      bumpScale: 0.4,
      metalness: 1,
      roughness: 1,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
    }),
    brass: phys({
      color: '#ffffff',
      map: brassMaps.map,
      roughnessMap: brassMaps.rough,
      bumpMap: brassMaps.bump,
      bumpScale: 0.3,
      metalness: 1,
      roughness: 1,
    }),
    steel: phys({
      color: '#ffffff',
      map: steelMaps.map,
      roughnessMap: steelMaps.rough,
      bumpMap: steelMaps.bump,
      bumpScale: 0.3,
      metalness: 1,
      roughness: 1,
    }),
    table: phys({
      color: '#ffffff',
      map: tableMaps.map,
      roughnessMap: tableMaps.rough,
      bumpMap: tableMaps.bump,
      bumpScale: 0.5,
      metalness: 0.85,
      roughness: 1,
    }),
    galv: phys({ color: '#a6adb2', metalness: 0.85, roughness: 0.5, roughnessMap: steelMaps.rough }),
    pvc: phys({ color: '#e9e7de', metalness: 0, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
    plate: phys({
      color: '#ffffff',
      map: plateMaps.map,
      roughnessMap: plateMaps.rough,
      bumpMap: plateMaps.bump,
      bumpScale: 0.5,
      metalness: 0.9,
      roughness: 1,
    }),
    plateClean: phys({
      color: '#ffffff',
      map: cleanMaps.map,
      roughnessMap: cleanMaps.rough,
      bumpMap: cleanMaps.bump,
      bumpScale: 0.2,
      metalness: 1,
      roughness: 1,
    }),
    nutLoose: phys({ color: '#b8923f', metalness: 1, roughness: 0.4 }),
    nutTight: phys({ color: '#e9c46a', metalness: 1, roughness: 0.22, emissive: '#12c98a', emissiveIntensity: 0.55 }),
    bead: phys({ color: '#9aa4b2', metalness: 1, roughness: 0.38, envMapIntensity: 1.3 }),
    redPaint: phys({ color: '#c8281e', metalness: 0.1, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    bluePaint: phys({ color: '#1f6fd0', metalness: 0.1, roughness: 0.4, clearcoat: 0.6 }),
    blackRubber: phys({ color: '#161719', metalness: 0, roughness: 0.75 }),
    darkMetal: phys({ color: '#26292e', metalness: 0.9, roughness: 0.45 }),
    machine: phys({ color: '#d03a2c', metalness: 0.3, roughness: 0.45, clearcoat: 0.5 }),
    floor: new THREE.MeshStandardMaterial({ map: floor.map, roughnessMap: floor.rough, bumpMap: floor.bump, bumpScale: 0.6, roughness: 1, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ map: wall.map, roughnessMap: wall.rough, bumpMap: wall.bump, bumpScale: 1.8, roughness: 1, metalness: 0 }),
    wallPlain: new THREE.MeshStandardMaterial({ map: plain.map, roughnessMap: plain.rough, bumpMap: plain.bump, bumpScale: 0.5, color: '#a9bad0', roughness: 1, metalness: 0 }),
    gaugeFace: new THREE.MeshBasicMaterial({ map: gaugeDial() }),
    ghost: new THREE.MeshBasicMaterial({ color: '#5cc8ff', transparent: true, opacity: 0.22, depthWrite: false }),
    ghostHot: new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.5, depthWrite: false }),
    invisible: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    water: new THREE.PointsMaterial({ color: '#9fdcff', size: 0.016, transparent: true, opacity: 0.9, depthWrite: false }),
  };
}

export function mats() {
  if (!cache) cache = build();
  return cache;
}
