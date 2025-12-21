import React, { useRef } from "react";
import { Environment, OrbitControls, ContactShadows } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useFrame } from "@react-three/fiber";
import { Foliage } from "./Foliage";
import { Ornaments } from "./Ornaments";
import { Polaroids } from "./Polaroids";
import { TreeStar } from "./TreeStar";
import { Snow } from "./Snow";
import { TreeMode } from "../types";

interface ExperienceProps {
  mode: TreeMode;
  handPosition: { x: number; y: number; detected: boolean };
  uploadedPhotos: string[];
  twoHandsDetected: boolean;
  onClosestPhotoChange?: (photoUrl: string | null) => void;
}

export const Experience: React.FC<ExperienceProps> = ({
  mode,
  handPosition,
  uploadedPhotos,
  twoHandsDetected,
  onClosestPhotoChange,
}) => {
  const controlsRef = useRef<any>(null);

  // Simple horizontal rotation based on hand X position
  // Also zoom out when in CHAOS mode (5 fingers open)
  useFrame(() => {
    if (controlsRef.current) {
      const controls = controlsRef.current;

      // Zoom out when in CHAOS mode
      const targetDistance = mode === TreeMode.CHAOS ? 35 : 25;
      const currentDistance = controls.getDistance();
      const distanceDiff = targetDistance - currentDistance;

      if (Math.abs(distanceDiff) > 0.5) {
        // Smoothly zoom to target distance
        const newDistance = currentDistance + distanceDiff * 0.05;
        // Set new distance by moving camera along its direction
        const direction = controls.object.position.clone().normalize();
        controls.object.position.copy(direction.multiplyScalar(newDistance));
        controls.update();
      }

      // Handle horizontal rotation based on hand position
      if (handPosition.detected) {
        // Calculate target azimuth based on hand X position
        // Hand at center (0.5) = no rotation, left/right = rotate
        const targetAzimuth = (handPosition.x - 0.5) * Math.PI * 1.5;

        // Smoothly rotate to target
        const currentAzimuth = controls.getAzimuthalAngle();
        let diff = targetAzimuth - currentAzimuth;

        // Handle angle wrapping
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;

        // Only rotate if difference is significant
        if (Math.abs(diff) > 0.01) {
          // Manually rotate the azimuth - faster speed
          controls.setAzimuthalAngle(currentAzimuth + diff * 0.15);
          controls.update();
        }
      }
    }
  });

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.8}
        minDistance={25}
        maxDistance={30}
        enableDamping
        dampingFactor={0.05}
        enabled={true}
      />

      {/* Lighting Setup for Maximum Luxury */}
      <Environment preset="lobby" background={false} blur={0.8} />

      <ambientLight intensity={0.5} color="#ffffff" />

      {/* Main spotlight */}
      <spotLight
        position={[10, 25, 10]}
        angle={0.3}
        penumbra={1}
        intensity={3}
        color="#fff5cc"
        castShadow
      />

      {/* Golden accent light */}
      <pointLight position={[-10, 8, -10]} intensity={2} color="#D4AF37" />

      {/* Christmas colored lights */}
      <pointLight
        position={[8, 3, 5]}
        intensity={1.5}
        color="#ff3333"
        distance={15}
      />
      <pointLight
        position={[-8, 5, 5]}
        intensity={1.5}
        color="#33ff33"
        distance={15}
      />
      <pointLight
        position={[0, 2, -8]}
        intensity={1.5}
        color="#ff6600"
        distance={15}
      />
      <pointLight
        position={[5, 8, -5]}
        intensity={1}
        color="#ff69b4"
        distance={12}
      />
      <pointLight
        position={[-5, 10, 3]}
        intensity={1}
        color="#00ffff"
        distance={12}
      />

      {/* Snow falling */}
      <Snow count={1500} />

      <group position={[0, -5, 0]}>
        <Foliage mode={mode} count={15000} />
        <Ornaments mode={mode} count={800} />
        <Polaroids
          mode={mode}
          uploadedPhotos={uploadedPhotos}
          twoHandsDetected={twoHandsDetected}
          onClosestPhotoChange={onClosestPhotoChange}
        />
        <TreeStar mode={mode} />

        {/* Floor Reflections */}
        <ContactShadows
          opacity={0.8}
          scale={35}
          blur={2.5}
          far={5}
          color="#000000"
        />
      </group>

      <EffectComposer enableNormalPass={false}>
        <Bloom
          luminanceThreshold={0.6}
          mipmapBlur
          intensity={2.5}
          radius={0.8}
        />
        <Vignette eskil={false} offset={0.1} darkness={0.6} />
        <Noise opacity={0.015} blendFunction={BlendFunction.OVERLAY} />
      </EffectComposer>
    </>
  );
};
