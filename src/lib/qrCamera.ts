import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

export type QrCameraStatus = 'apagada' | 'iniciando' | 'activa' | 'sin-permiso' | 'sin-camara';

interface Detector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
type DetectorCtor = { new (opts: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

// BarcodeDetector cuando el navegador lo trae (Android, macOS); si no, jsQR sobre un cuadro del video
async function makeDetector(): Promise<Detector | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? [];
    return formats.includes('qr_code') ? new Ctor({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

// Lee códigos QR con la cámara de la computadora mientras `enabled` sea true
export function useQrCamera(enabled: boolean, onCode: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<QrCameraStatus>('apagada');
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!enabled) {
      setStatus('apagada');
      return;
    }
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let last = { text: '', at: 0 };
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const scan = async (detector: Detector | null) => {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (video.readyState >= 2 && video.videoWidth) {
        let text = '';
        try {
          if (detector) text = (await detector.detect(video))[0]?.rawValue ?? '';
          else if (ctx) {
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            text = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? '';
          }
        } catch {
          /* cuadro ilegible */
        }
        // El mismo código frente a la cámara no se reporta en ráfaga
        if (text && (text !== last.text || Date.now() - last.at > 2000)) {
          last = { text, at: Date.now() };
          onCodeRef.current(text);
        }
      }
      if (!stopped) timer = window.setTimeout(() => void scan(detector), 160);
    };

    setStatus('iniciando');
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'NotFoundError' });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setStatus('activa');
        void scan(await makeDetector());
      } catch (e) {
        if (stopped) return;
        setStatus((e as Error).name === 'NotAllowedError' || (e as Error).name === 'SecurityError' ? 'sin-permiso' : 'sin-camara');
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

  return { videoRef, status };
}
