import { useEffect, useRef, useState } from "react";

const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const GESTURE_COOLDOWN_MS = 850;
const ARM_COOLDOWN_MS = 1300;
const FIST_HOLD_MS = 320;
const MAX_HISTORY_MS = 1200;
const MIN_ACTIVE_POINTS = 4;
const MIN_DIRECTION_SCORE = 0.055;
const DIRECTION_MARGIN = 1.02;
const MAX_PINCH_HISTORY_MS = 800;
const PINCH_OPEN_THRESHOLD = 0.82;
const PINCH_CLOSE_THRESHOLD = 0.34;
const PINCH_DELTA_THRESHOLD = 0.12;
const PINCH_PRIORITY_MAX_PALM_TRAVEL = 0.12;

let handLandmarkerPromise = null;

async function loadHandLandmarker() {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = import("@mediapipe/tasks-vision").then(
      async ({ FilesetResolver, HandLandmarker }) => {
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        return HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_PATH,
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.5,
        });
      }
    );
  }

  return handLandmarkerPromise;
}

function isSecureEnough() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.isSecureContext) {
    return true;
  }

  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getPalmCenter(landmarks) {
  const palmIndexes = [0, 5, 9, 13, 17];
  const total = palmIndexes.reduce(
    (acc, index) => {
      const point = landmarks[index];
      return {
        x: acc.x + (point?.x ?? 0),
        y: acc.y + (point?.y ?? 0),
      };
    },
    { x: 0, y: 0 }
  );

  return {
    x: total.x / palmIndexes.length,
    y: total.y / palmIndexes.length,
  };
}

function getFingerDistances(landmarks, palmCenter) {
  const tipIndexes = [8, 12, 16, 20];
  return tipIndexes.map((index) => {
    const point = landmarks[index];
    if (!point) {
      return 0;
    }
    return Math.hypot(point.x - palmCenter.x, point.y - palmCenter.y);
  });
}

function average(numbers) {
  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function getLandmarkDistance(landmarks, firstIndex, secondIndex) {
  const first = landmarks[firstIndex];
  const second = landmarks[secondIndex];
  if (!first || !second) {
    return 0;
  }

  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getPalmWidth(landmarks) {
  return Math.max(getLandmarkDistance(landmarks, 5, 17), 0.001);
}

function isClosedFist(landmarks, palmCenter) {
  const distances = getFingerDistances(landmarks, palmCenter);
  const averageDistance = average(distances);
  const maxDistance = Math.max(...distances);

  return averageDistance <= 0.09 && maxDistance <= 0.115;
}

function isGestureHand(landmarks, palmCenter) {
  const distances = getFingerDistances(landmarks, palmCenter);
  return average(distances) >= 0.118;
}

function isFingerExtended(landmarks, palmCenter, tipIndex, jointIndex, margin = 0.018) {
  const tipDistance = Math.hypot(
    (landmarks[tipIndex]?.x ?? 0) - palmCenter.x,
    (landmarks[tipIndex]?.y ?? 0) - palmCenter.y
  );
  const jointDistance = Math.hypot(
    (landmarks[jointIndex]?.x ?? 0) - palmCenter.x,
    (landmarks[jointIndex]?.y ?? 0) - palmCenter.y
  );

  return tipDistance - jointDistance >= margin;
}

function isThumbExtended(landmarks, palmCenter) {
  const tipDistance = Math.hypot(
    (landmarks[4]?.x ?? 0) - palmCenter.x,
    (landmarks[4]?.y ?? 0) - palmCenter.y
  );
  const jointDistance = Math.hypot(
    (landmarks[3]?.x ?? 0) - palmCenter.x,
    (landmarks[3]?.y ?? 0) - palmCenter.y
  );

  return tipDistance - jointDistance >= 0.01;
}

function isPinchControlHand(landmarks, palmCenter, pinchRatio) {
  const indexExtended = isFingerExtended(landmarks, palmCenter, 8, 6, 0.012);
  const middleExtended = isFingerExtended(landmarks, palmCenter, 12, 10, 0.012);
  const ringExtended = isFingerExtended(landmarks, palmCenter, 16, 14, 0.012);
  const pinkyExtended = isFingerExtended(landmarks, palmCenter, 20, 18, 0.01);
  const thumbExtended = isThumbExtended(landmarks, palmCenter);
  const extraExtendedCount = [middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

  return (
    (indexExtended || pinchRatio <= PINCH_OPEN_THRESHOLD + 0.12) &&
    (thumbExtended || pinchRatio <= PINCH_CLOSE_THRESHOLD + 0.2) &&
    extraExtendedCount <= 2
  );
}

function averagePoint(points) {
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function detectSwipe(points) {
  const activePoints = points.filter((point) => point.active);
  if (activePoints.length < MIN_ACTIVE_POINTS) {
    return null;
  }

  const baselineSize = Math.min(3, activePoints.length);
  const start = averagePoint(activePoints.slice(0, baselineSize));
  const end = averagePoint(activePoints.slice(-baselineSize));

  const moveRight = Math.max(...activePoints.map((point) => start.x - point.x), 0);
  const moveLeft = Math.max(...activePoints.map((point) => point.x - start.x), 0);
  const moveUp = Math.max(...activePoints.map((point) => start.y - point.y), 0);
  const moveDown = Math.max(...activePoints.map((point) => point.y - start.y), 0);

  const netDx = end.x - start.x;
  const netDy = end.y - start.y;

  const scores = [
    {
      direction: "right",
      score: moveRight * 0.8 + Math.max(-netDx, 0) * 0.2,
    },
    {
      direction: "left",
      score: moveLeft * 0.8 + Math.max(netDx, 0) * 0.2,
    },
    {
      direction: "up",
      score: moveUp * 0.8 + Math.max(-netDy, 0) * 0.2,
    },
    {
      direction: "down",
      score: moveDown * 0.8 + Math.max(netDy, 0) * 0.2,
    },
  ].sort((left, right) => right.score - left.score);

  const best = scores[0];
  const second = scores[1];

  if (!best || best.score < MIN_DIRECTION_SCORE) {
    return null;
  }

  if (second && best.score < second.score * DIRECTION_MARGIN) {
    return null;
  }

  return best.direction;
}

function detectPinchGesture(samples) {
  if (samples.length < 4) {
    return null;
  }

  const distances = samples.map((sample) => sample.distance);
  const firstDistance = average(distances.slice(0, Math.min(2, distances.length)));
  const lastDistance = average(distances.slice(-Math.min(2, distances.length)));
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);
  const spread = maxDistance - minDistance;

  if (spread < PINCH_DELTA_THRESHOLD) {
    return null;
  }

  if (
    minDistance <= PINCH_CLOSE_THRESHOLD &&
    lastDistance - minDistance >= PINCH_DELTA_THRESHOLD &&
    lastDistance >= PINCH_OPEN_THRESHOLD - 0.06
  ) {
    return "volume_up";
  }

  if (
    maxDistance >= PINCH_OPEN_THRESHOLD - 0.04 &&
    maxDistance - lastDistance >= PINCH_DELTA_THRESHOLD &&
    lastDistance <= PINCH_OPEN_THRESHOLD - 0.08
  ) {
    return "volume_down";
  }

  if (
    firstDistance <= PINCH_CLOSE_THRESHOLD &&
    maxDistance - firstDistance >= PINCH_DELTA_THRESHOLD &&
    lastDistance >= PINCH_OPEN_THRESHOLD - 0.06
  ) {
    return "volume_up";
  }

  if (
    firstDistance >= PINCH_OPEN_THRESHOLD - 0.04 &&
    firstDistance - minDistance >= PINCH_DELTA_THRESHOLD &&
    lastDistance <= PINCH_OPEN_THRESHOLD - 0.08
  ) {
    return "volume_down";
  }

  return null;
}

function getPalmTravel(points) {
  const activePoints = points.filter((point) => point.active);
  if (activePoints.length < 2) {
    return 0;
  }

  const baselineSize = Math.min(2, activePoints.length);
  const start = averagePoint(activePoints.slice(0, baselineSize));
  const end = averagePoint(activePoints.slice(-baselineSize));
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export default function useMirrorGestureCamera({ enabled, onGestureDetected }) {
  const videoRef = useRef(null);
  const onGestureDetectedRef = useRef(onGestureDetected);
  const [status, setStatus] = useState({
    state: "off",
    phase: "off",
    armed: false,
    gesture: "none",
    detail: "Turn on Gesture camera in the mobile mirror settings.",
  });

  useEffect(() => {
    onGestureDetectedRef.current = onGestureDetected;
  }, [onGestureDetected]);

  useEffect(() => {
    if (!enabled) {
      setStatus({
        state: "off",
        phase: "off",
        armed: false,
        gesture: "none",
        detail: "Turn on Gesture camera in the mobile mirror settings.",
      });
      return undefined;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus({
        state: "unsupported",
        phase: "unsupported",
        armed: false,
        gesture: "none",
        detail: "This browser cannot open a live mirror camera stream.",
      });
      return undefined;
    }

    if (!isSecureEnough()) {
      setStatus({
        state: "blocked",
        phase: "blocked",
        armed: false,
        gesture: "none",
        detail: "Open the mirror over HTTPS or localhost to allow camera access.",
      });
      return undefined;
    }

    let cancelled = false;
    let animationFrameId = 0;
    let stream = null;
    const history = [];
    const pinchHistory = [];
    const lastGestureAtRef = { current: 0 };
    const lastArmAtRef = { current: 0 };
    const fistStartedAtRef = { current: 0 };
    const readyRef = { current: false };

    const updateStatus = (updates) => {
      setStatus((current) => ({
        ...current,
        ...updates,
      }));
    };

    const clearHistory = () => {
      history.splice(0, history.length);
      pinchHistory.splice(0, pinchHistory.length);
    };

    const setLocked = (gesture = "none", detail = "Locked. Make a fist to unlock.") => {
      readyRef.current = false;
      fistStartedAtRef.current = 0;
      clearHistory();
      updateStatus({
        state: "live",
        phase: "locked",
        armed: false,
        gesture,
        detail,
      });
    };

    const stopLoop = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
    };

    const stopStream = () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };

    const run = async () => {
      setStatus({
        state: "starting",
        phase: "starting",
        armed: false,
        gesture: "none",
        detail: "Requesting camera access for live hand tracking.",
      });

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 360 },
          },
        });

        if (cancelled) {
          stopStream();
          return;
        }

        const video = videoRef.current;
        if (!video) {
          throw new Error("Mirror preview element is unavailable.");
        }

        video.srcObject = stream;
        await video.play();

        const handLandmarker = await loadHandLandmarker();
        if (cancelled) {
          stopStream();
          return;
        }

        setLocked();

        const detectFrame = () => {
          if (cancelled || !videoRef.current) {
            return;
          }

          const activeVideo = videoRef.current;
          if (activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const now = performance.now();
            const result = handLandmarker.detectForVideo(activeVideo, now);
            const landmarks = result?.landmarks?.[0];

            if (!landmarks?.length) {
              fistStartedAtRef.current = 0;
              clearHistory();
              animationFrameId = requestAnimationFrame(detectFrame);
              return;
            }

            const palmCenter = getPalmCenter(landmarks);
            const closedFist = isClosedFist(landmarks, palmCenter);
            const gestureHand = isGestureHand(landmarks, palmCenter);

            if (!readyRef.current) {
              if (closedFist) {
                if (!fistStartedAtRef.current) {
                  fistStartedAtRef.current = now;
                }

                if (
                  now - fistStartedAtRef.current >= FIST_HOLD_MS &&
                  now - lastArmAtRef.current >= ARM_COOLDOWN_MS
                ) {
                  lastArmAtRef.current = now;
                  readyRef.current = true;
                  fistStartedAtRef.current = 0;
                  clearHistory();
                  updateStatus({
                    state: "live",
                    phase: "ready",
                    armed: true,
                    gesture: "none",
                    detail: "Ready.",
                  });
                }
              } else {
                fistStartedAtRef.current = 0;
              }

              animationFrameId = requestAnimationFrame(detectFrame);
              return;
            }

            if (closedFist || !gestureHand) {
              clearHistory();
              animationFrameId = requestAnimationFrame(detectFrame);
              return;
            }

            history.push({
              x: palmCenter.x,
              y: palmCenter.y,
              t: now,
              active: true,
            });

            while (history.length && now - history[0].t > MAX_HISTORY_MS) {
              history.shift();
            }

            const pinchDistance =
              getLandmarkDistance(landmarks, 4, 8) / getPalmWidth(landmarks);
            const pinchControlHand = isPinchControlHand(
              landmarks,
              palmCenter,
              pinchDistance
            );
            const palmTravel = getPalmTravel(history);

            pinchHistory.push({
              distance: pinchDistance,
              t: now,
            });

            while (pinchHistory.length && now - pinchHistory[0].t > MAX_PINCH_HISTORY_MS) {
              pinchHistory.shift();
            }

            const pinchGesture = detectPinchGesture(pinchHistory);
            const shouldPrioritizePinch =
              pinchControlHand || palmTravel <= PINCH_PRIORITY_MAX_PALM_TRAVEL;

            if (shouldPrioritizePinch && pinchGesture) {
              if (now - lastGestureAtRef.current >= GESTURE_COOLDOWN_MS) {
                lastGestureAtRef.current = now;
                onGestureDetectedRef.current?.(pinchGesture);
                setLocked(
                  pinchGesture,
                  `Detected ${pinchGesture === "volume_up" ? "volume up" : "volume down"}. Make a fist for the next command.`
                );
              }

              animationFrameId = requestAnimationFrame(detectFrame);
              return;
            }

            if (shouldPrioritizePinch) {
              updateStatus({
                state: "live",
                phase: "ready",
                armed: true,
                gesture: "none",
                detail: "Ready.",
              });
            } else {
              pinchHistory.splice(0, Math.max(0, pinchHistory.length - 2));
            }

            const gesture = detectSwipe(history);
            if (gesture && now - lastGestureAtRef.current >= GESTURE_COOLDOWN_MS) {
              lastGestureAtRef.current = now;
              onGestureDetectedRef.current?.(gesture);
              setLocked(gesture, `Detected ${gesture}. Make a fist for the next command.`);
            }
          }

          animationFrameId = requestAnimationFrame(detectFrame);
        };

        animationFrameId = requestAnimationFrame(detectFrame);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const detail =
          error?.name === "NotAllowedError"
            ? "Camera permission was denied for the mirror page."
            : "The mirror camera could not start. Check browser permissions and camera availability.";
        setStatus({
          state: "error",
          phase: "error",
          armed: false,
          gesture: "none",
          detail,
        });
        stopStream();
      }
    };

    run();

    return () => {
      cancelled = true;
      stopLoop();
      stopStream();
    };
  }, [enabled]);

  return {
    videoRef,
    status,
  };
}
