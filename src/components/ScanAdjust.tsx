"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Maths : homographie + warp perspective ───────────────────────────────────

/** Résolution d'un système linéaire 8×8 par élimination de Gauss avec pivot */
function gaussSolve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let maxR = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[r][c]) > Math.abs(M[maxR][c])) maxR = r;
    }
    [M[c], M[maxR]] = [M[maxR], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

/**
 * Calcule la matrice d'homographie [h0..h7] (h8=1) telle que :
 * fromPts[i] → toPts[i] pour i = 0..3
 */
function computeHomography(
  fromPts: [number, number][],
  toPts: [number, number][],
): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [X, Y] = fromPts[i];
    const [x, y] = toPts[i];
    A.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y]);
    b.push(x);
    A.push([0, 0, 0, X, Y, 1, -y * X, -y * Y]);
    b.push(y);
  }
  return gaussSolve(A, b);
}

/**
 * Applique une correction perspective sur le canvas source.
 * corners = [TL, TR, BR, BL] en coordonnées pixels dans src.
 * Retourne un nouveau canvas redressé (outW × outH).
 */
function perspectiveWarp(
  src: HTMLCanvasElement,
  corners: [number, number][],
  outW: number,
  outH: number,
): HTMLCanvasElement {
  // Mappage inverse : output (X,Y) → source (x,y)
  const fromPts: [number, number][] = [
    [0, 0], [outW, 0], [outW, outH], [0, outH],
  ];
  const [h0, h1, h2, h3, h4, h5, h6, h7] = computeHomography(fromPts, corners);

  const srcCtx = src.getContext("2d", { willReadFrequently: true })!;
  const srcData = srcCtx.getImageData(0, 0, src.width, src.height);
  const sd = srcData.data;
  const sw = src.width;
  const sh = src.height;

  const dst = document.createElement("canvas");
  dst.width = outW;
  dst.height = outH;
  const dstCtx = dst.getContext("2d")!;
  const dstData = dstCtx.createImageData(outW, outH);
  const dd = dstData.data;

  for (let Y = 0; Y < outH; Y++) {
    for (let X = 0; X < outW; X++) {
      const w = h6 * X + h7 * Y + 1;
      const x = Math.round((h0 * X + h1 * Y + h2) / w);
      const y = Math.round((h3 * X + h4 * Y + h5) / w);
      if (x >= 0 && x < sw && y >= 0 && y < sh) {
        const si = (y * sw + x) * 4;
        const di = (Y * outW + X) * 4;
        dd[di]     = sd[si];
        dd[di + 1] = sd[si + 1];
        dd[di + 2] = sd[si + 2];
        dd[di + 3] = 255;
      }
    }
  }
  dstCtx.putImageData(dstData, 0, 0);
  return dst;
}

// ─── Composant ────────────────────────────────────────────────────────────────

type Props = {
  rawCanvas: HTMLCanvasElement;
  /** Appelé avec le canvas corrigé par perspective */
  onConfirm: (corrected: HTMLCanvasElement) => void;
  /** Appelé si l'utilisateur veut utiliser l'image originale sans correction */
  onSkip: () => void;
  /** Fermer sans rien faire */
  onCancel: () => void;
};

export default function ScanAdjust({ rawCanvas, onConfirm, onSkip, onCancel }: Props) {
  // Coins en % du conteneur affiché — ordre : TL, TR, BR, BL
  const [corners, setCorners] = useState<[number, number][]>([
    [8, 8], [92, 8], [92, 92], [8, 92],
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Génère l'aperçu JPEG de l'image brute
    setImageUrl(rawCanvas.toDataURL("image/jpeg", 0.82));
  }, [rawCanvas]);

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(idx);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging === null || !containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100));
      setCorners((prev) =>
        prev.map((c, i) => (i === dragging ? [x, y] : c)) as [number, number][],
      );
    },
    [dragging],
  );

  const handlePointerUp = useCallback(() => setDragging(null), []);

  const applyCorrection = useCallback(async () => {
    setProcessing(true);
    try {
      const iw = rawCanvas.width;
      const ih = rawCanvas.height;

      // Convertit les % en pixels réels dans le canvas source
      const srcCorners = corners.map(
        ([px, py]) => [(px / 100) * iw, (py / 100) * ih] as [number, number],
      );

      // Calcule les dimensions de sortie d'après les longueurs des bords
      const [tl, tr, br, bl] = srcCorners;
      const wTop   = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
      const wBot   = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
      const hLeft  = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
      const hRight = Math.hypot(br[0] - tr[0], br[1] - tr[1]);
      const rawW = Math.max(wTop, wBot);
      const rawH = Math.max(hLeft, hRight);

      // Limité à 2 200 px sur le grand côté (idéal pour OCR)
      const maxPx = 2200;
      const scale = Math.max(rawW, rawH) > maxPx ? maxPx / Math.max(rawW, rawH) : 1;
      const outW = Math.max(10, Math.round(rawW * scale));
      const outH = Math.max(10, Math.round(rawH * scale));

      // Laisse le navigateur afficher le spinner avant le calcul lourd
      await new Promise<void>((r) => setTimeout(r, 60));
      const corrected = perspectiveWarp(rawCanvas, srcCorners, outW, outH);
      onConfirm(corrected);
    } catch {
      onSkip();
    } finally {
      setProcessing(false);
    }
  }, [rawCanvas, corners, onConfirm, onSkip]);

  // Points SVG pour le polygone de cadrage
  const svgPoints = corners.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-3">
      <div className="w-full max-w-lg flex flex-col bg-zinc-900 rounded-3xl overflow-hidden">

        {/* En-tête */}
        <div className="flex items-start justify-between px-4 py-3 bg-zinc-800">
          <div>
            <p className="text-white font-black text-sm">Ajuster les coins</p>
            <p className="text-zinc-400 text-[11px] mt-0.5 leading-snug">
              Glissez les 4 points oranges sur les coins du document
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-zinc-400 hover:text-white transition-colors mt-0.5 ml-3 flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Zone image + poignées */}
        <div
          ref={containerRef}
          className="relative bg-black select-none"
          style={{ touchAction: "none" }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Document à corriger"
              className="w-full block"
              style={{ maxHeight: "62vh", objectFit: "contain" }}
              draggable={false}
            />
          )}

          {/* Overlay SVG — quadrilatère orange */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            <polygon
              points={svgPoints}
              fill="rgba(249,115,22,0.10)"
              stroke="#f97316"
              strokeWidth="0.6"
              strokeDasharray="3 1.5"
            />
            {/* Lignes des coins pour meilleure lisibilité */}
            {corners.map(([x, y], i) => {
              const next = corners[(i + 1) % 4];
              return (
                <line
                  key={i}
                  x1={x} y1={y}
                  x2={next[0]} y2={next[1]}
                  stroke="#f97316"
                  strokeWidth="0.5"
                />
              );
            })}
          </svg>

          {/* Poignées de coin */}
          {corners.map(([x, y], idx) => (
            <div
              key={idx}
              className="absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
                touchAction: "none",
              }}
              onPointerDown={(e) => handlePointerDown(e, idx)}
            >
              {/* Zone tactile plus grande que le point visible */}
              <div className="w-10 h-10 flex items-center justify-center cursor-grab active:cursor-grabbing">
                <div
                  className="w-5 h-5 rounded-full bg-orange-500 border-2 border-white shadow-lg shadow-black/50 transition-transform active:scale-125"
                  style={{ boxShadow: "0 0 0 3px rgba(249,115,22,0.3), 0 2px 8px rgba(0,0,0,0.6)" }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Boutons */}
        <div className="flex gap-2 p-4">
          <button
            type="button"
            onClick={onSkip}
            disabled={processing}
            className="flex-1 bg-zinc-700 text-zinc-200 py-3 rounded-xl font-semibold text-sm hover:bg-zinc-600 disabled:opacity-40 transition-colors"
          >
            Sans correction
          </button>
          <button
            type="button"
            onClick={() => void applyCorrection()}
            disabled={processing}
            className="flex-[2] bg-orange-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Correction en cours…
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Corriger et analyser
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
