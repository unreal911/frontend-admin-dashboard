'use client';

import { useEffect, useRef, useState } from 'react';

// Tipado minimo de la BarcodeDetector API (no esta en la lib DOM de TS).
type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

interface BarcodeScanButtonProps {
  // Recibe el codigo escaneado por camara (SKU o codigo de barras).
  onScan: (code: string) => void;
  className?: string;
  label?: string;
}

/**
 * Boton de escaneo por camara (BarcodeDetector). Al detectar un codigo llama
 * onScan y cierra la camara. Pensado para alimentar el buscador de inventario:
 * apuntas al codigo y el listado se filtra al instante. Si el navegador no
 * soporta BarcodeDetector, el boton no se renderiza.
 */
export function BarcodeScanButton({ onScan, className, label = 'Escanear' }: BarcodeScanButtonProps) {
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const supportsCamera = getBarcodeDetectorCtor() !== null
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!cameraOn) {
      return;
    }
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor) {
      setCameraOn(false);
      return;
    }
    let stopped = false;
    let rafId = 0;
    const detector = new Ctor({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf', 'codabar'],
    });

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        const tick = async () => {
          if (stopped || !videoRef.current) {
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            const code = String(codes?.[0]?.rawValue || '').trim();
            if (code) {
              if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(30);
              }
              onScan(code);
              setCameraOn(false);
              return;
            }
          } catch {
            // frame no analizable: ignora y sigue.
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch {
        setCameraOn(false);
      }
    };
    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  if (!supportsCamera) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={className || 'admin-ghost-btn'}
        onClick={() => setCameraOn(true)}
        aria-label={label}
      >
        {label}
      </button>
      {cameraOn ? (
        <>
          <div className="admin-modal-overlay inventory-scan-overlay" onClick={() => setCameraOn(false)} />
          <div className="inventory-scan-modal" role="dialog" aria-label="Escaner de codigo">
            <video ref={videoRef} className="inventory-scan-video" muted playsInline />
            <p className="inventory-scan-hint">Apunta al codigo de barras del producto</p>
            <button type="button" className="admin-ghost-btn" onClick={() => setCameraOn(false)}>
              Cerrar camara
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
