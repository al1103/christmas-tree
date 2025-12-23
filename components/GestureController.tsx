import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import React, { useEffect, useRef, useState } from "react";
import { TreeMode } from "../types";

interface GestureControllerProps {
  onModeChange: (mode: TreeMode) => void;
  currentMode: TreeMode;
  onHandPosition?: (x: number, y: number, detected: boolean) => void;
  onTwoHandsDetected?: (detected: boolean) => void;
  onCameraReady?: () => void;
}

export const GestureController: React.FC<GestureControllerProps> = ({
  onModeChange,
  currentMode,
  onHandPosition,
  onTwoHandsDetected,
  onCameraReady,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [gestureStatus, setGestureStatus] = useState<string>("Initializing...");
  const [handPos, setHandPos] = useState<{ x: number; y: number } | null>(null);
  const lastModeRef = useRef<TreeMode>(currentMode);
  const [showPermissionPopup, setShowPermissionPopup] = useState(true);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameIdRef = useRef<number>(0);

  // Debounce logic refs
  const openFrames = useRef(0);
  const closedFrames = useRef(0);
  const CONFIDENCE_THRESHOLD = 5;

  // Request camera permission
  const requestCameraPermission = () => {
    setShowPermissionPopup(false);
  };

  useEffect(() => {
    if (showPermissionPopup) return;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
        );

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath: `/models/hand_landmarker.task`,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
          },
        );

        startWebcam();
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
      }
    };

    const startWebcam = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: "user",
              frameRate: { ideal: 30 },
            },
          });

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.addEventListener("loadeddata", () => {
              predictWebcam();
              if (onCameraReady) onCameraReady();
            });
            setIsLoaded(true);
            setGestureStatus("Waiting for hand...");
          }
        } catch (err) {
          console.error("Error accessing webcam:", err);
          setGestureStatus("Permission Denied");
        }
      }
    };

    const drawSingleHandSkeleton = (
      landmarks: any[],
      ctx: CanvasRenderingContext2D,
      canvas: HTMLCanvasElement,
    ) => {
      const connections = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [0, 5],
        [5, 6],
        [6, 7],
        [7, 8],
        [0, 9],
        [9, 10],
        [10, 11],
        [11, 12],
        [0, 13],
        [13, 14],
        [14, 15],
        [15, 16],
        [0, 17],
        [17, 18],
        [18, 19],
        [19, 20],
        [5, 9],
        [9, 13],
        [13, 17],
      ];

      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "#D4AF37";
      connections.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        ctx.beginPath();
        ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
        ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
        ctx.stroke();
      });

      landmarks.forEach((landmark) => {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 0.8, 0, 2 * Math.PI);
        ctx.fillStyle = "#228B22";
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 0.3;
        ctx.stroke();
      });
    };

    const drawAllHands = (allLandmarks: any[][]) => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      allLandmarks.forEach((landmarks) => {
        drawSingleHandSkeleton(landmarks, ctx, canvas);
      });
    };

    const predictWebcam = () => {
      if (!handLandmarkerRef.current || !videoRef.current) return;

      const startTimeMs = performance.now();
      if (videoRef.current.videoWidth > 0) {
        const result = handLandmarkerRef.current.detectForVideo(
          videoRef.current,
          startTimeMs,
        );

        if (result.landmarks && result.landmarks.length > 0) {
          drawAllHands(result.landmarks);
          const landmarks = result.landmarks[0];
          detectGesture(landmarks);
        } else {
          setGestureStatus("No hand detected");
          setHandPos(null);
          if (onHandPosition) onHandPosition(0.5, 0.5, false);
          if (onTwoHandsDetected) onTwoHandsDetected(false);
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
              ctx.clearRect(
                0,
                0,
                canvasRef.current.width,
                canvasRef.current.height,
              );
            }
          }
          openFrames.current = Math.max(0, openFrames.current - 1);
          closedFrames.current = Math.max(0, closedFrames.current - 1);
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(predictWebcam);
    };

    const detectGesture = (landmarks: any[]) => {
      const wrist = landmarks[0];
      const palmCenterX =
        (landmarks[0].x +
          landmarks[5].x +
          landmarks[9].x +
          landmarks[13].x +
          landmarks[17].x) /
        5;
      const palmCenterY =
        (landmarks[0].y +
          landmarks[5].y +
          landmarks[9].y +
          landmarks[13].y +
          landmarks[17].y) /
        5;

      setHandPos({ x: palmCenterX, y: palmCenterY });
      if (onHandPosition) onHandPosition(palmCenterX, palmCenterY, true);

      const fingerTips = [8, 12, 16, 20];
      const fingerBases = [5, 9, 13, 17];
      let extendedFingers = 0;

      for (let i = 0; i < 4; i++) {
        const tip = landmarks[fingerTips[i]];
        const base = landmarks[fingerBases[i]];
        const distTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
        const distBase = Math.hypot(base.x - wrist.x, base.y - wrist.y);
        if (distTip > distBase * 1.5) extendedFingers++;
      }

      const thumbTip = landmarks[4];
      const thumbBase = landmarks[2];
      const distThumbTip = Math.hypot(
        thumbTip.x - wrist.x,
        thumbTip.y - wrist.y,
      );
      const distThumbBase = Math.hypot(
        thumbBase.x - wrist.x,
        thumbBase.y - wrist.y,
      );
      if (distThumbTip > distThumbBase * 1.2) extendedFingers++;

      const indexTip = landmarks[8];
      const indexBase = landmarks[5];
      const distIndexTip = Math.hypot(
        indexTip.x - wrist.x,
        indexTip.y - wrist.y,
      );
      const distIndexBase = Math.hypot(
        indexBase.x - wrist.x,
        indexBase.y - wrist.y,
      );
      const isIndexExtended = distIndexTip > distIndexBase * 1.1;
      const pinchDistance = Math.hypot(
        thumbTip.x - indexTip.x,
        thumbTip.y - indexTip.y,
      );
      const isPinching = pinchDistance < 0.08 && isIndexExtended;

      if (isPinching) {
        openFrames.current++;
        closedFrames.current = 0;
        setGestureStatus("Detected: PINCH (Show Photo)");
        if (openFrames.current > CONFIDENCE_THRESHOLD) {
          if (onTwoHandsDetected) onTwoHandsDetected(true);
        }
      } else if (extendedFingers >= 4) {
        closedFrames.current = 0;
        openFrames.current = 0;
        setGestureStatus("Detected: OPEN (Unleash)");
        if (lastModeRef.current !== TreeMode.CHAOS) {
          lastModeRef.current = TreeMode.CHAOS;
          onModeChange(TreeMode.CHAOS);
        }
        if (onTwoHandsDetected) onTwoHandsDetected(false);
      } else if (extendedFingers <= 1) {
        closedFrames.current++;
        openFrames.current = 0;
        setGestureStatus("Detected: CLOSED (Restore)");
        if (closedFrames.current > CONFIDENCE_THRESHOLD) {
          if (lastModeRef.current !== TreeMode.FORMED) {
            lastModeRef.current = TreeMode.FORMED;
            onModeChange(TreeMode.FORMED);
          }
        }
        if (onTwoHandsDetected) onTwoHandsDetected(false);
      } else {
        setGestureStatus("Detected: ...");
        openFrames.current = 0;
        closedFrames.current = 0;
        if (onTwoHandsDetected) onTwoHandsDetected(false);
      }
    };

    setupMediaPipe();

    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
    };
  }, [
    showPermissionPopup,
    onModeChange,
    onHandPosition,
    onTwoHandsDetected,
    onCameraReady,
  ]);

  useEffect(() => {
    lastModeRef.current = currentMode;
  }, [currentMode]);

  return (
    <>
      {/* Camera Permission Popup */}
      {showPermissionPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-[#0a1f0a] to-[#001a0d] border border-[#D4AF37]/50 rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-[#D4AF37]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>

              <h2
                className="text-2xl font-bold text-[#D4AF37] mb-4"
                style={{ fontFamily: "Cinzel, serif" }}>
                Cho phép Camera
              </h2>

              <p className="text-[#F5E6BF]/80 mb-6 leading-relaxed">
                Ứng dụng cần quyền truy cập camera để{" "}
                <span className="text-[#D4AF37] font-semibold">
                  nhận diện cử chỉ tay
                </span>{" "}
                của bạn và điều khiển cây thông Noel.
              </p>

              <div className="text-left text-sm text-[#F5E6BF]/60 mb-6 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[#D4AF37]">✋</span>
                  <span>Xòe tay - Unleash hiệu ứng</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#D4AF37]">✊</span>
                  <span>Nắm tay - Khôi phục cây thông</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#D4AF37]">👌</span>
                  <span>Chụm ngón - Xem ảnh kỷ niệm</span>
                </div>
              </div>

              <button
                onClick={requestCameraPermission}
                className="w-full py-3 px-6 bg-gradient-to-r from-[#D4AF37] to-[#C5A028] text-black font-bold rounded-lg hover:from-[#F5E6BF] hover:to-[#D4AF37] transition-all duration-300 shadow-lg hover:shadow-[#D4AF37]/30">
                Cho phép Camera
              </button>

              <p className="text-xs text-[#F5E6BF]/40 mt-4">
                Dữ liệu camera chỉ được xử lý trên thiết bị của bạn
              </p>
            </div>
          </div>
        </div>
      )}

      <div
        className="absolute top-6 right-[8%] z-50 flex flex-col items-end pointer-events-none"
        style={{ opacity: 0, pointerEvents: "none" }}>
        <video
          ref={videoRef}
          id="webcam-video"
          autoPlay
          playsInline
          muted
          style={{
            width: "640px",
            height: "480px",
            position: "fixed",
            bottom: "0",
            right: "0",
            opacity: 0.001,
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
        <canvas ref={canvasRef} style={{ width: "1px", height: "1px" }} />
      </div>
    </>
  );
};
