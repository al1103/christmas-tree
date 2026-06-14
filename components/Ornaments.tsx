import React, { useMemo, useRef, useState, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TreeMode } from "../types";

interface OrnamentsProps {
  mode: TreeMode;
  count: number;
}

type OrnamentType = "ball" | "gift" | "light";

interface InstanceData {
  chaosPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  type: OrnamentType;
  color: THREE.Color;
  scale: number;
  speed: number;
  rotationOffset: THREE.Euler;
}

export const Ornaments: React.FC<OrnamentsProps> = ({ mode, count }) => {
  // We use 3 separate InstancedMeshes for different geometries/materials to reduce draw calls
  // but allow unique shapes.
  const ballsRef = useRef<THREE.InstancedMesh>(null);
  const giftsRef = useRef<THREE.InstancedMesh>(null);
  const lightsRef = useRef<THREE.InstancedMesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Generate data once
  const { ballsData, giftsData, lightsData } = useMemo(() => {
    const _balls: InstanceData[] = [];
    const _gifts: InstanceData[] = [];
    const _lights: InstanceData[] = [];

    const height = 11; // Slightly smaller than foliage
    const maxRadius = 4.5;

    // Luxury Colors
    const gold = new THREE.Color("#D4AF37");
    const red = new THREE.Color("#8B0000"); // Dark Velvet Red
    const emerald = new THREE.Color("#004422");
    const whiteGold = new THREE.Color("#F5E6BF");

    const palette = [gold, red, gold, whiteGold];

    for (let i = 0; i < count; i++) {
      const rnd = Math.random();
      let type: OrnamentType = "ball";
      if (rnd > 0.8) type = "gift";
      if (rnd > 0.9) type = "light"; // Less lights as geometry, more via bloom

      // 1. Target Position (Spiral with heavy density at bottom)
      // Use power function to bias distribution toward bottom (lower yNorm values)
      const yNorm = Math.pow(Math.random(), 2.5); // Heavy concentration at bottom
      const y = yNorm * height + 0.5;
      const rScale = 1 - yNorm;
      const theta = y * 10 + Math.random() * Math.PI * 2; // Wind around

      // Push ornaments slightly outside the foliage radius
      const r = maxRadius * rScale + Math.random() * 0.5;

      const targetPos = new THREE.Vector3(
        r * Math.cos(theta),
        y,
        r * Math.sin(theta)
      );

      // 2. Chaos Position
      const cR = 15 + Math.random() * 15;
      const cTheta = Math.random() * Math.PI * 2;
      const cPhi = Math.acos(2 * Math.random() - 1);
      const chaosPos = new THREE.Vector3(
        cR * Math.sin(cPhi) * Math.cos(cTheta),
        cR * Math.sin(cPhi) * Math.sin(cTheta) + 5,
        cR * Math.cos(cPhi)
      );

      const scale = type === "light" ? 0.15 : 0.2 + Math.random() * 0.25;
      const color =
        type === "light"
          ? new THREE.Color("#FFFFAA")
          : palette[Math.floor(Math.random() * palette.length)];

      const data: InstanceData = {
        chaosPos,
        targetPos,
        type,
        color,
        scale,
        speed: 0.5 + Math.random() * 1.5, // Random speed for physics feel
        rotationOffset: new THREE.Euler(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          0
        ),
      };

      if (type === "ball") _balls.push(data);
      else if (type === "gift") _gifts.push(data);
      else _lights.push(data);
    }

    return { ballsData: _balls, giftsData: _gifts, lightsData: _lights };
  }, [count]);

  useLayoutEffect(() => {
    // Set initial colors
    [
      { ref: ballsRef, data: ballsData },
      { ref: giftsRef, data: giftsData },
      { ref: lightsRef, data: lightsData },
    ].forEach(({ ref, data }) => {
      if (ref.current) {
        data.forEach((d, i) => {
          ref.current!.setColorAt(i, d.color);
        });
        ref.current.instanceColor!.needsUpdate = true;
      }
    });
  }, [ballsData, giftsData, lightsData]);

  const progressRefs = useRef<{
    balls: Float32Array;
    gifts: Float32Array;
    lights: Float32Array;
  } | null>(null);

  if (!progressRefs.current) {
    progressRefs.current = {
      balls: new Float32Array(ballsData.length),
      gifts: new Float32Array(giftsData.length),
      lights: new Float32Array(lightsData.length),
    };
  }

  useFrame((state, delta) => {
    const isFormed = mode === TreeMode.FORMED;
    const time = state.clock.elapsedTime;
    const progress = progressRefs.current!;

    const updateMesh = (
      ref: React.RefObject<THREE.InstancedMesh>,
      data: InstanceData[],
      progressArray: Float32Array
    ) => {
      if (!ref.current) return;

      data.forEach((d, i) => {
        let p = progressArray[i];
        if (isFormed) {
          p = Math.min(1, p + delta * d.speed);
        } else {
          p = Math.max(0, p - delta * d.speed * 1.5);
        }
        progressArray[i] = p;

        const easedP = p * p * (3 - 2 * p);
        dummy.position.lerpVectors(d.chaosPos, d.targetPos, easedP);

        if (isFormed && p > 0.95) {
          dummy.position.y += Math.sin(time * 2 + i) * 0.002;
        }

        if (d.type === "gift") {
          dummy.rotation.set(time * 0.5 + d.rotationOffset.x, time * 0.2 + d.rotationOffset.y, 0);
        } else {
          dummy.lookAt(0, dummy.position.y, 0);
        }

        dummy.scale.setScalar(d.scale);
        if (d.type === "light") {
          const pulse = 1 + Math.sin(time * 5 + d.chaosPos.y) * 0.3;
          dummy.scale.multiplyScalar(pulse);
        }

        dummy.updateMatrix();
        ref.current!.setMatrixAt(i, dummy.matrix);
      });

      ref.current.instanceMatrix.needsUpdate = true;
    };

    updateMesh(ballsRef, ballsData, progress.balls);
    updateMesh(giftsRef, giftsData, progress.gifts);
    updateMesh(lightsRef, lightsData, progress.lights);
  });

  return (
    <>
      {/* Balls: High Gloss Gold/Red - reduced geometry for performance */}
      <instancedMesh
        ref={ballsRef}
        args={[undefined, undefined, ballsData.length]}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          roughness={0.15}
          metalness={0.85}
          envMapIntensity={1.2}
        />
      </instancedMesh>

      {/* Gifts: Cubes with ribbons (simplified as cubes) */}
      <instancedMesh
        ref={giftsRef}
        args={[undefined, undefined, giftsData.length]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.3}
          metalness={0.5}
          color="#white" // Tinted by instance color
        />
      </instancedMesh>

      {/* Lights: Emissive small spheres - reduced geometry */}
      <instancedMesh
        ref={lightsRef}
        args={[undefined, undefined, lightsData.length]}
      >
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial color="#FFFFCC" toneMapped={false} />
      </instancedMesh>
    </>
  );
};
