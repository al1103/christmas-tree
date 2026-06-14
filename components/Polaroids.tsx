import React, { useMemo, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
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

const photoFiles = import.meta.glob('/public/photos/*.{jpg,jpeg,png,webp,gif}', { eager: true });
// Lấy danh sách đường dẫn ảnh (bỏ prefix /public vì khi chạy web root là public)
const DEFAULT_PHOTOS = Object.keys(photoFiles).map(path => path.replace('/public', ''));

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
    const photos = uploadedPhotos.length > 0 ? uploadedPhotos : DEFAULT_PHOTOS;
    const height = 9;
    const maxRadius = 5.0;
    const data: PhotoData[] = [];
    const count = photos.length;

    for (let i = 0; i < count; i++) {
      const yNorm = 0.2 + (i / count) * 0.6;
      const y = yNorm * height;
      const r = maxRadius * (1 - yNorm) + 0.8;
      const theta = i * 2.39996;

      const targetPos = new THREE.Vector3(
        r * Math.cos(theta),
        y,
        r * Math.sin(theta)
      );

      const chaosRadius = 8 + Math.random() * 4;
      const chaosAngle = (i / count) * Math.PI * 2;
      const chaosY = 5 + Math.sin(i * 1.5) * 3;

      const chaosPos = new THREE.Vector3(
        Math.cos(chaosAngle) * chaosRadius,
        chaosY,
        Math.sin(chaosAngle) * chaosRadius + 10
      );

      data.push({
        id: i,
        url: photos[i],
        chaosPos,
        targetPos,
        speed: 1.5 + Math.random() * 0.5,
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
        onClosestPhotoChange(photoData[closestIndex].url);
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
