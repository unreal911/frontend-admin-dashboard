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

interface PickingScanPanelProps {
  // Recibe el codigo escaneado/tecleado (SKU o codigo de barras).
  onScan: (code: string) => void;
  disabled?: boolean;
}

/**
 * Barra de escaneo para picking. Funciona con:
 *  - Pistola lectora / teclado: la mayoria de scanners emulan teclado y "tipean"
 *    el codigo + Enter. El input queda enfocado y submit dispara +1.
 *  - Camara del telefono (BarcodeDetector) cuando el navegador la soporta.
 * Cooldown por codigo para no contar el mismo escaneo varias veces por segundo.
 */
export function PickingScanPanel({ onScan, disabled }: PickingScanPanelProps) {
  const [manual, setManual] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const supportsCamera = getBarcodeDetectorCtor() !== null
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);

  const emit = (raw: string) => {
    const code = String(raw || '').trim();
    if (!code || disabled) {
      return;
    }
    const now = Date.now();
    // Anti-duplicado: mismo codigo dentro de 1.2s se ignora (la camara lo ve
    // en varios frames; el scan-gun no repite pero no estorba).
    if (lastScanRef.current.code === code && now - lastScanRef.current.at < 1200) {
      return;
    }
    lastScanRef.current = { code, at: now };
    onScan(code);
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(30);
    }
  };

  // Bucle de deteccion por camara mientras cameraOn.
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
            if (codes && codes.length > 0) {
              emit(String(codes[0]?.rawValue || ''));
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

  return (
    <div className="pk-scan">
      <form
        className="pk-scan-row"
        onSubmit={(event) => {
          event.preventDefault();
          emit(manual);
          setManual('');
          inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          className="pk-scan-input"
          type="text"
          value={manual}
          placeholder="Escanea o escribe el SKU y Enter…"
          autoFocus
          disabled={disabled}
          onChange={(event) => setManual(event.target.value)}
        />
        <button type="submit" className="admin-ghost-btn" disabled={disabled || manual.trim() === ''}>
          +1
        </button>
        {supportsCamera ? (
          <button
            type="button"
            className="admin-ghost-btn"
            disabled={disabled}
            onClick={() => setCameraOn((value) => !value)}
          >
            {cameraOn ? 'Cerrar cámara' : 'Cámara'}
          </button>
        ) : null}
      </form>
      {cameraOn ? (
        <div className="pk-scan-camera">
          <video ref={videoRef} className="pk-scan-video" muted playsInline />
          <span className="pk-scan-hint">Apunta al código de barras del producto</span>
        </div>
      ) : null}
    </div>
  );
}
