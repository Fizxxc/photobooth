'use client';

import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

export function useCamera(
  videoRef: RefObject<HTMLVideoElement>,
  options = { width: 1920, height: 1080, frameRate: 60 }
) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, [videoRef]);

  const start = useCallback(async () => {
    try {
      setError(null);
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: options.width, min: 1280 },
          height: { ideal: options.height, min: 720 },
          frameRate: { ideal: options.frameRate, min: 30 },
          aspectRatio: { ideal: 16 / 9 }
        }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsReady(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Camera initialization failed');
    }
  }, [options.frameRate, options.height, options.width, stop, videoRef]);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video) throw new Error('Video element is unavailable.');

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || options.width;
    canvas.height = video.videoHeight || options.height;
    const context = canvas.getContext('2d');

    if (!context) throw new Error('Canvas is unavailable.');

    context.filter = 'saturate(1.1) brightness(1.05)';
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Capture failed.'));
        resolve(blob);
      }, 'image/jpeg', 0.95);
    });
  }, [options.height, options.width, videoRef]);

  useEffect(() => () => stop(), [stop]);

  return { isReady, error, start, stop, captureFrame };
}
