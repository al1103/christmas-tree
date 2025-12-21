import React, { useRef, useMemo } from "react";
import { Environment, OrbitControls, ContactShadows } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useFrame, useThree } from "@react-three/fiber";
import { Foliage } from "./Foliage";
import { Ornaments } from "./Ornaments";
import { Polaroids } from "./Polaroids";
import { TreeStar } from "./TreeStar";
import { Snow } from "./Snow";
import { TreeMode } from "../types";

// Detect mobile device
const isMobile =
  typeof window !== "undefined" &&
  (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) ||
    window.innerWidth < 768);

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

      // Handle rotation based on hand position (both horizontal and vertical)
      if (handPosition.detected) {
        // Calculate target azimuth based on hand X position (left/right)
        const targetAzimuth = (handPosition.x - 0.5) * Math.PI * 1.5;

        // Calculate target polar based on hand Y position (up/down)
        // Invert Y because screen Y increases downward
        const minPolar = Math.PI / 4;
        const maxPolar = Math.PI / 1.8;
        const targetPolar =
          minPolar + (1 - handPosition.y) * (maxPolar - minPolar);

        // Smoothly rotate azimuth (horizontal)
        const currentAzimuth = controls.getAzimuthalAngle();
        let azimuthDiff = targetAzimuth - currentAzimuth;
        if (azimuthDiff > Math.PI) azimuthDiff -= Math.PI * 2;
        if (azimuthDiff < -Math.PI) azimuthDiff += Math.PI * 2;

        if (Math.abs(azimuthDiff) > 0.01) {
          controls.setAzimuthalAngle(currentAzimuth + azimuthDiff * 0.15);
        }

        // Smoothly rotate polar (vertical)
        const currentPolar = controls.getPolarAngle();
        const polarDiff = targetPolar - currentPolar;

        if (Math.abs(polarDiff) > 0.01) {
          controls.setPolarAngle(currentPolar + polarDiff * 0.1);
        }

        controls.update();
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

      {/* Lighting Setup - optimized */}
      <Environment preset="lobby" background={false} blur={0.8} />
      <ambientLight intensity={0.6} color="#ffffff" />

      {/* Main spotlight */}
      <spotLight
        position={[10, 25, 10]}
        angle={0.3}
        penumbra={1}
        intensity={2.5}
        color="#fff5cc"
        castShadow={!isMobile}
      />

      {/* Golden accent light */}
      <pointLight position={[-10, 8, -10]} intensity={1.5} color="#D4AF37" />

      {/* Extra lights only on PC for performance */}
      {!isMobile && (
        <>
          <pointLight
            position={[8, 3, 5]}
            intensity={1}
            color="#ff3333"
            distance={15}
          />
          <pointLight
            position={[-8, 5, 5]}
            intensity={1}
            color="#33ff33"
            distance={15}
          />
          <pointLight
            position={[0, 2, -8]}
            intensity={1}
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

          {/* More festive lights around the tree */}
          <pointLight
            position={[6, 6, 6]}
            intensity={0.8}
            color="#ffcc00"
            distance={10}
          />
          <pointLight
            position={[-6, 4, 6]}
            intensity={0.8}
            color="#ff00ff"
            distance={10}
          />
          <pointLight
            position={[0, 12, 0]}
            intensity={1.2}
            color="#ffffff"
            distance={15}
          />
          <pointLight
            position={[4, 2, -6]}
            intensity={0.8}
            color="#00ff88"
            distance={10}
          />
          <pointLight
            position={[-4, 7, -4]}
            intensity={0.8}
            color="#8800ff"
            distance={10}
          />
          <pointLight
            position={[7, 9, 2]}
            intensity={0.8}
            color="#ff4488"
            distance={10}
          />
        </>
      )}

      {/* Snow falling - optimized for performance */}
      <Snow count={isMobile ? 300 : 600} />

      <group position={[0, -5, 0]}>
        <Foliage mode={mode} count={isMobile ? 4000 : 10000} />
        <Ornaments mode={mode} count={isMobile ? 250 : 500} />
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

      {/* Post-processing effects - optimized for performance */}
      <EffectComposer enableNormalPass={false}>
        <Bloom
          luminanceThreshold={0.7}
          mipmapBlur
          intensity={isMobile ? 1.2 : 2.0}
          radius={0.6}
        />
        <Vignette eskil={false} offset={0.1} darkness={0.5} />
      </EffectComposer>
    </>
  );
};
