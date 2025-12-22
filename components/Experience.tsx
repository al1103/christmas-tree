import React, { useRef } from "react";
import { Environment, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useFrame } from "@react-three/fiber";
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

// Detect low-spec PC (less than 8 logical cores or small screen)
const isLowSpecPC =
  typeof window !== "undefined" &&
  !isMobile &&
  (navigator.hardwareConcurrency <= 4 || window.innerWidth < 1400);

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
  const frameCount = useRef(0);

  // Skip every other frame for better performance
  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;

    if (controlsRef.current) {
      const controls = controlsRef.current;

      // Zoom out when in CHAOS mode
      const targetDistance = mode === TreeMode.CHAOS ? 35 : 25;
      const currentDistance = controls.getDistance();
      const distanceDiff = targetDistance - currentDistance;

      if (Math.abs(distanceDiff) > 0.5) {
        const newDistance = currentDistance + distanceDiff * 0.08;
        const direction = controls.object.position.clone().normalize();
        controls.object.position.copy(direction.multiplyScalar(newDistance));
        controls.update();
      }

      // Handle rotation based on hand position
      if (handPosition.detected) {
        const targetAzimuth = (handPosition.x - 0.5) * Math.PI * 1.5;
        const minPolar = Math.PI / 4;
        const maxPolar = Math.PI / 1.8;
        const targetPolar =
          minPolar + (1 - handPosition.y) * (maxPolar - minPolar);

        const currentAzimuth = controls.getAzimuthalAngle();
        let azimuthDiff = targetAzimuth - currentAzimuth;
        if (azimuthDiff > Math.PI) azimuthDiff -= Math.PI * 2;
        if (azimuthDiff < -Math.PI) azimuthDiff += Math.PI * 2;

        if (Math.abs(azimuthDiff) > 0.01) {
          controls.setAzimuthalAngle(currentAzimuth + azimuthDiff * 0.15);
        }

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

      {/* Lighting Setup */}
      <Environment preset="lobby" background={false} blur={0.8} />
      <ambientLight intensity={0.7} color="#ffffff" />

      {/* Main spotlight - no shadows for performance */}
      <spotLight
        position={[10, 25, 10]}
        angle={0.3}
        penumbra={1}
        intensity={2.5}
        color="#fff5cc"
        castShadow={false}
      />

      {/* Golden accent light */}
      <pointLight
        position={[-10, 8, -10]}
        intensity={1.5}
        color="#D4AF37"
        distance={25}
      />

      {/* Color accent lights - always on for better visuals */}
      <pointLight
        position={[8, 5, 5]}
        intensity={0.6}
        color="#ff3333"
        distance={12}
      />
      <pointLight
        position={[-8, 5, 5]}
        intensity={0.6}
        color="#33ff33"
        distance={12}
      />

      {/* Snow - balanced count */}
      <Snow count={isMobile ? 150 : isLowSpecPC ? 200 : 350} />

      <group position={[0, -5, 0]}>
        {/* Balanced particle counts */}
        <Foliage
          mode={mode}
          count={isMobile ? 2500 : isLowSpecPC ? 4000 : 6000}
        />
        <Ornaments
          mode={mode}
          count={isMobile ? 100 : isLowSpecPC ? 150 : 250}
        />
        <Polaroids
          mode={mode}
          uploadedPhotos={uploadedPhotos}
          twoHandsDetected={twoHandsDetected}
          onClosestPhotoChange={onClosestPhotoChange}
        />
        <TreeStar mode={mode} />
      </group>

      {/* Post-processing - simplified but still beautiful */}
      {!isMobile && (
        <EffectComposer enableNormalPass={false}>
          <Bloom
            luminanceThreshold={0.75}
            mipmapBlur
            intensity={1.0}
            radius={0.4}
          />
        </EffectComposer>
      )}
    </>
  );
};
