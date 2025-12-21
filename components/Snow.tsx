import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface SnowProps {
  count?: number;
}

export const Snow: React.FC<SnowProps> = ({ count = 2000 }) => {
  const meshRef = useRef<THREE.Points>(null);

  const { positions, velocities, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    const siz = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Random positions in a cylinder around the tree
      const radius = 15 + Math.random() * 20;
      const angle = Math.random() * Math.PI * 2;

      pos[i * 3] = Math.cos(angle) * radius * Math.random();
      pos[i * 3 + 1] = Math.random() * 30 - 5; // Height from -5 to 25
      pos[i * 3 + 2] = Math.sin(angle) * radius * Math.random();

      // Random fall speeds
      vel[i] = 0.5 + Math.random() * 1.5;

      // Random sizes
      siz[i] = 0.5 + Math.random() * 1.5;
    }

    return { positions: pos, velocities: vel, sizes: siz };
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const positions = meshRef.current.geometry.attributes.position
      .array as Float32Array;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      // Fall down
      positions[i * 3 + 1] -= velocities[i] * delta * 2;

      // Gentle horizontal sway
      positions[i * 3] += Math.sin(time + i) * 0.01;
      positions[i * 3 + 2] += Math.cos(time + i * 0.5) * 0.01;

      // Reset if below ground
      if (positions[i * 3 + 1] < -5) {
        positions[i * 3 + 1] = 25;
      }
    }

    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color="#ffffff"
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
