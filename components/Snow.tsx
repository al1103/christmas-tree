import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface SnowProps {
  count?: number;
}

// Vertex shader for GPU-based snow animation
const snowVertexShader = `
  uniform float uTime;
  attribute float aSpeed;
  attribute float aOffset;
  
  varying float vAlpha;
  
  void main() {
    vec3 pos = position;
    
    // Animate Y position based on time (falling)
    float fall = mod(pos.y - uTime * aSpeed * 2.0, 30.0) - 5.0;
    pos.y = fall;
    
    // Gentle horizontal sway
    pos.x += sin(uTime + aOffset) * 0.3;
    pos.z += cos(uTime * 0.7 + aOffset * 0.5) * 0.3;
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (3.0 + aSpeed) * (15.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    
    vAlpha = 0.6 + aSpeed * 0.2;
  }
`;

const snowFragmentShader = `
  varying float vAlpha;
  
  void main() {
    float r = distance(gl_PointCoord, vec2(0.5));
    if (r > 0.5) discard;
    
    float glow = 1.0 - r * 2.0;
    gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha * glow);
  }
`;

export const Snow: React.FC<SnowProps> = ({ count = 500 }) => {
  const meshRef = useRef<THREE.Points>(null);

  const { positions, speeds, offsets } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    const off = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Random positions in a cylinder around the tree
      const radius = 15 + Math.random() * 20;
      const angle = Math.random() * Math.PI * 2;

      pos[i * 3] = Math.cos(angle) * radius * Math.random();
      pos[i * 3 + 1] = Math.random() * 30 - 5; // Height from -5 to 25
      pos[i * 3 + 2] = Math.sin(angle) * radius * Math.random();

      // Random fall speeds
      spd[i] = 0.3 + Math.random() * 0.7;

      // Random offset for sway
      off[i] = Math.random() * Math.PI * 2;
    }

    return { positions: pos, speeds: spd, offsets: off };
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    []
  );

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
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
          attach="attributes-aSpeed"
          count={count}
          array={speeds}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aOffset"
          count={count}
          array={offsets}
          itemSize={1}
        />
      </bufferGeometry>
      {/* @ts-ignore */}
      <shaderMaterial
        vertexShader={snowVertexShader}
        fragmentShader={snowFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
