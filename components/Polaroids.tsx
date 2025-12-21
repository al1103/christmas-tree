import React, { useMemo, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { TreeMode } from "../types";

/**
 * ==================================================================================
 *  INSTRUCTIONS FOR LOCAL PHOTOS
 * ==================================================================================
 * 1. Create a folder named "photos" inside your "public" directory.
 *    (e.g., public/photos/)
 *
 * 2. Place your JPG images in there.
 *
 * 3. Rename them sequentially:
 *    1.jpg, 2.jpg, 3.jpg ... up to 13.jpg
 *
 *    If a file is missing (e.g., you only have 5 photos), the frame will
 *    display a placeholder instead of crashing the app.
 * ==================================================================================
 */

const PHOTO_COUNT = 22; // How many polaroid frames to generate

interface PolaroidsProps {
  mode: TreeMode;
  uploadedPhotos: string[];
  twoHandsDetected: boolean;
  onClosestPhotoChange?: (photoUrl: string | null) => void;
}

interface PhotoData {
  id: number;
  url: string;
  chaosPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  speed: number;
}

const PolaroidItem: React.FC<{
  data: PhotoData;
  mode: TreeMode;
  index: number;
}> = ({ data, mode, index }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [error, setError] = useState(false);

  // Safe texture loading that won't crash the app if a file is missing
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      data.url,
      (loadedTex) => {
        loadedTex.colorSpace = THREE.SRGBColorSpace;
        setTexture(loadedTex);
        setError(false);
      },
      undefined, // onProgress
      (err) => {
        console.warn(`Failed to load image: ${data.url}`, err);
        setError(true);
      }
    );
  }, [data.url]);

  // Reusable objects to avoid creating new ones each frame
  const tempObj = useMemo(() => new THREE.Object3D(), []);
  const swayOffset = useMemo(() => Math.random() * 100, []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const isFormed = mode === TreeMode.FORMED;
    const time = state.clock.elapsedTime;
    const targetPos = isFormed ? data.targetPos : data.chaosPos;
    const pos = groupRef.current.position;

    // Only lerp if distance is significant (optimization)
    if (pos.distanceToSquared(targetPos) > 0.001) {
      pos.lerp(targetPos, delta * data.speed);
    }

    if (isFormed) {
      // Simplified rotation - look at center and face outward
      tempObj.position.copy(pos);
      tempObj.lookAt(0, pos.y, 0);
      tempObj.rotateY(Math.PI);
      groupRef.current.quaternion.slerp(tempObj.quaternion, delta * data.speed);

      // Simple sway using rotation directly
      const sway = Math.sin(time * 2 + swayOffset) * 0.03;
      groupRef.current.rotation.z += sway * delta;
    } else {
      // Chaos mode - face camera
      tempObj.position.copy(pos);
      tempObj.lookAt(0, 9, 20);
      groupRef.current.quaternion.slerp(tempObj.quaternion, delta * 2);
    }
  });

  return (
    <group ref={groupRef}>
      {/* The Hanging String (Visual only) - fades out at top */}
      <mesh position={[0, 1.2, -0.1]}>
        <cylinderGeometry args={[0.005, 0.005, 1.5]} />
        <meshStandardMaterial
          color="#D4AF37"
          metalness={1}
          roughness={0.2}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Frame Group (Offset slightly so string connects to top center) */}
      <group position={[0, 0, 0]}>
        {/* White Paper Backing */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1.2, 1.5, 0.02]} />
          <meshStandardMaterial color="#fdfdfd" roughness={0.8} />
        </mesh>

        {/* The Photo Area */}
        <mesh position={[0, 0.15, 0.025]}>
          <planeGeometry args={[1.0, 1.0]} />
          {texture && !error ? (
            <meshBasicMaterial map={texture} />
          ) : (
            // Fallback Material (Red for error, Grey for loading)
            <meshStandardMaterial color={error ? "#550000" : "#cccccc"} />
          )}
        </mesh>

        {/* "Tape" or Gold Clip */}
        <mesh position={[0, 0.7, 0.025]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.1, 0.05, 0.05]} />
          <meshStandardMaterial color="#D4AF37" metalness={1} roughness={0.2} />
        </mesh>

        {/* Text Label */}
        <Text
          position={[0, -0.55, 0.03]}
          fontSize={0.12}
          color="#333"
          anchorX="center"
          anchorY="middle"
        >
          {error ? "Image not found" : "Happy Memories"}
        </Text>
      </group>
    </group>
  );
};

export const Polaroids: React.FC<PolaroidsProps> = ({
  mode,
  uploadedPhotos,
  twoHandsDetected,
  onClosestPhotoChange,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const [closestPhotoIndex, setClosestPhotoIndex] = React.useState<number>(0);

  const photoData = useMemo(() => {
    // Don't render any photos if none are uploaded
    if (uploadedPhotos.length === 0) {
      return [];
    }

    const data: PhotoData[] = [];
    const height = 9; // Range of height on tree
    const maxRadius = 5.0; // Slightly outside the foliage radius (which is approx 5 at bottom)

    const count = uploadedPhotos.length;

    for (let i = 0; i < count; i++) {
      // 1. Target Position
      // Distributed nicely on the cone surface
      const yNorm = 0.2 + (i / count) * 0.6; // Keep between 20% and 80% height
      const y = yNorm * height;

      // Radius decreases as we go up
      const r = maxRadius * (1 - yNorm) + 0.8; // +0.8 to ensure it floats OUTSIDE leaves

      // Golden Angle Spiral for even distribution
      const theta = i * 2.39996; // Golden angle in radians

      const targetPos = new THREE.Vector3(
        r * Math.cos(theta),
        y,
        r * Math.sin(theta)
      );

      // 2. Chaos Position - Stack photos directly in front of camera
      // Camera is at [0, 4, 20], Scene group offset is [0, -5, 0]
      const relativeY = 7; // Center height
      const relativeZ = 14; // In front of camera

      // Arrange photos in grid directly facing camera (2-3 columns)
      const cols = Math.min(3, count);
      const rows = Math.ceil(count / cols);
      const spacingX = 2.5;
      const spacingY = 2.5;

      const col = i % cols;
      const row = Math.floor(i / cols);

      // Center the grid
      const offsetX = ((cols - 1) * spacingX) / 2;
      const offsetY = ((rows - 1) * spacingY) / 2;

      const chaosPos = new THREE.Vector3(
        col * spacingX - offsetX, // Centered horizontally
        relativeY + offsetY - row * spacingY, // Stacked vertically
        relativeZ // Same distance - directly in front
      );

      data.push({
        id: i,
        url: uploadedPhotos[i],
        chaosPos,
        targetPos,
        speed: 1.5 + Math.random() * 0.5, // Faster speed for snappier transitions
      });
    }
    return data;
  }, [uploadedPhotos]);

  // Update closest photo every frame when two hands are detected
  useFrame((state) => {
    if (twoHandsDetected && groupRef.current && photoData.length > 0) {
      // Get camera position in world coordinates
      const cameraPos = state.camera.position.clone();

      let minDistance = Infinity;
      let closestIndex = 0;

      // Check each photo's actual world position
      groupRef.current.children.forEach((child, i) => {
        if (i < photoData.length) {
          // Get world position of the photo
          const worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);

          const distance = worldPos.distanceTo(cameraPos);
          if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
          }
        }
      });

      setClosestPhotoIndex(closestIndex);

      // Notify parent component about the closest photo
      if (onClosestPhotoChange) {
        onClosestPhotoChange(uploadedPhotos[closestIndex]);
      }
    } else if (onClosestPhotoChange) {
      // Clear the overlay when two hands are not detected
      onClosestPhotoChange(null);
    }
  });

  return (
    <group ref={groupRef}>
      {photoData.map((data, i) => (
        <PolaroidItem key={i} index={i} data={data} mode={mode} />
      ))}
    </group>
  );
};
