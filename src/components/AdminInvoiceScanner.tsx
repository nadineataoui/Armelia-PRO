"use client";

import React, { useCallback, useRef, useState } from "react";
import * as Tesseract from "tesseract.js";
import { parseInvoice } from "@/lib/parseInvoice";

type PdfJs = typeof import("pdfjs-dist");
type BitmapClosable = { close?: () => void };

type InvoiceInput = {
  date: string;
  fournisseur: string;
  montant: string;
  libelle: string;
};

// ── Helpers canvas (identiques à ClientDashboard) ───────────────────────────
const cloneCanvas = (source: HTMLCanvasElement) => {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return canvas;
  } catch { return null; }
};

const sharpenCanvas = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dst = ctx.createImageData(src.width, src.height);
  const d = src.data; const o = dst.data;
  const w = src.width; const h = src.height;
  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
        const ki = ((y + ky) * w + (x + kx)) * 4;
        const kv = k[(ky + 1) * 3 + (kx + 1)];
        r += d[ki] * kv; g += d[ki + 1] * kv; b += d[ki + 2] * kv;
      }
      o[i] = Math.max(0, Math.min(255, r)); o[i+1] = Math.max(0, Math.min(255, g));
      o[i+2] = Math.max(0, Math.min(255, b)); o[i+3] = 255;
    }
  }
  for (let x = 0; x < w; x++) for (const y of [0, h-1]) { const i=(y*w+x)*4; o[i]=d[i];o[i+1]=d[i+1];o[i+2]=d[i+2];o[i+3]=d[i+3]; }
  for (let y = 0; y < h; y++) for (const x of [0, w-1]) { const i=(y*w+x)*4; o[i]=d[i];o[i+1]=d[i+1];o[i+2]=d[i+2];o[i+3]=d[i+3]; }
  ctx.putImageData(dst, 0, 0);
};

const preprocessCanvasForOcr = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const contrast = 55;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const histogram = new Array<number>(256).fill(0);
  const grayValues = new Uint8Array(image.data.length / 4);
  for (let i = 0, p = 0; i < image.data.length; i += 4, p++) {
    const gray = 0.2126 * image.data[i] + 0.7152 * image.data[i+1] + 0.0722 * image.data[i+2];
    let v = factor * (gray - 128) + 128; v = Math.max(0, Math.min(255, v + 12));
    grayValues[p] = v | 0; histogram[v | 0]++;
  }
  const total = grayValues.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0, wB = 0, wF = 0, maxVar = -1, threshold = 160;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t]; if (wB === 0) continue; wF = total - wB; if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB; const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = t; }
  }
  for (let i = 0, p = 0; i < image.data.length; i += 4, p++) {
    const v = grayValues[p] > threshold ? 255 : 0;
    image.data[i] = v; image.data[i+1] = v; image.data[i+2] = v; image.data[i+3] = 255;
  }
  ctx.putImageData(image, 0, 0);
};

const preprocessImageFileToCanvas = async (file: File) => {
  const url = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    img.decoding = "async"; img.src = url;
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("Impossible de charger l'image")); });
    const bitmap = await createImageBitmap(img);
    try {
      const maxWidth = 1500;
      const ratio = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Impossible de créer le contexte canvas");
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally { (bitmap as unknown as BitmapClosable).close?.(); }
  } finally { URL.revokeObjectURL(url); }
};

// ── Composant principal ──────────────────────────────────────────────────────
export default function AdminInvoiceScanner({
  clientId,
  clientCode,
  onInvoiceAdded,
}: {
  clientId: string;
  clientCode: string;
  onInvoiceAdded: (invoice: { id: string; date: Date; fournisseur: string; montant: number; libelle: string; numeroPiece: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceInput>({ date: "", fournisseur: "", montant: "", libelle: "" });
  const [saving, setSaving] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pdfjsRef = useRef<PdfJs | null>(null);
  const pdfjsLoadRef = useRef<Promise<PdfJs> | null>(null);
  const tesseractWorkerRef = useRef<Tesseract.Worker | null>(null);
  const tesseractLoadRef = useRef<Promise<Tesseract.Worker> | null>(null);
  const processSeqRef = useRef(0);
  const activeProcessRef = useRef(0);

  const ensurePdfJsLoaded = useCallback(async () => {
    if (pdfjsRef.current) return pdfjsRef.current;
    if (!pdfjsLoadRef.current) {
      pdfjsLoadRef.current = (async () => {
        const mod = await import("pdfjs-dist");
        mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        pdfjsRef.current = mod;
        return mod;
      })();
    }
    return pdfjsLoadRef.current;
  }, []);

  const ensureTesseractWorker = useCallback(async () => {
    if (tesseractWorkerRef.current) return tesseractWorkerRef.current;
    if (!tesseractLoadRef.current) {
      tesseractLoadRef.current = (async () => {
        const worker = await Tesseract.createWorker(["fra", "eng"], 1, { logger: () => {} });
        tesseractWorkerRef.current = worker;
        return worker;
      })();
    }
    return tesseractLoadRef.current;
  }, []);

  const parseAndSet = useCallback(async (text: string, processId: number, canvas?: HTMLCanvasElement) => {
    if (activeProcessRef.current !== processId) return;
    try {
      let body: Record<string, unknown>;
      if (canvas) {
        const MAX = 1600;
        const ratio = Math.min(1, MAX / Math.max(canvas.width, canvas.height));
        let imgCanvas = canvas;
        if (ratio < 1) {
          imgCanvas = document.createElement("canvas");
          imgCanvas.width = Math.round(canvas.width * ratio);
          imgCanvas.height = Math.round(canvas.height * ratio);
          const ctx = imgCanvas.getContext("2d");
          if (ctx) ctx.drawImage(canvas, 0, 0, imgCanvas.width, imgCanvas.height);
        }
        const dataUrl = imgCanvas.toDataURL("image/jpeg", 0.88);
        body = { imageBase64: dataUrl.split(",")[1], mediaType: "image/jpeg", ocrText: text };
      } else {
        body = { ocrText: text };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok && activeProcessRef.current === processId) {
        const data = (await res.json()) as { date?: string|null; fournisseur?: string|null; montant?: number|null; libelle?: string|null; error?: string };
        if (!data.error) {
          setInvoice({
            date: data.date ?? "",
            fournisseur: data.fournisseur ? data.fournisseur.toUpperCase().slice(0, 50) : "",
            montant: typeof data.montant === "number" ? data.montant.toFixed(2) : "",
            libelle: data.libelle ? data.libelle.toUpperCase() : "",
          });
          setProgress(100);
          return;
        }
      }
    } catch { /* fallback */ }
    if (activeProcessRef.current !== processId) return;
    const p = parseInvoice(text);
    setInvoice({
      date: p.date ?? "",
      fournisseur: p.fournisseur ? p.fournisseur.toUpperCase().slice(0, 50) : "",
      montant: p.montant === null ? "" : p.montant.toFixed(2),
      libelle: p.libelle ? p.libelle.toUpperCase() : "",
    });
    setProgress(100);
  }, []);

  const processFile = useCallback(async (picked: File, preCanvas?: HTMLCanvasElement) => {
    const processId = ++processSeqRef.current;
    activeProcessRef.current = processId;
    setIsProcessing(true);
    setProgress(0);
    setInvoice({ date: "", fournisseur: "", montant: "", libelle: "" });

    // Preview
    if (preCanvas) {
      setPreviewUrl(preCanvas.toDataURL("image/jpeg", 0.8));
    } else {
      setPreviewUrl(URL.createObjectURL(picked));
    }

    try {
      type TextItem = { str: string; hasEOL?: boolean };
      type TextContent = { items: TextItem[] };
      type PdfViewport = { height: number; width: number };
      type PdfPage = {
        getViewport: (o: { scale: number }) => PdfViewport;
        render: (o: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
        getTextContent: () => Promise<TextContent>;
      };
      type PdfDocument = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
      type PdfGetDocumentResult = { promise: Promise<PdfDocument> };

      let sourceCanvas: HTMLCanvasElement | null = preCanvas ?? null;

      // ── Gemini Vision direct sur image originale ────────────────────────
      if (!preCanvas && picked.type.startsWith("image/")) {
        setProgress(10);
        try {
          const arrayBuffer = await picked.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = ""; for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
          const imageBase64 = btoa(binary);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 18000);
          const res = await fetch("/api/parse-invoice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64, mediaType: picked.type || "image/jpeg" }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok && activeProcessRef.current === processId) {
            const data = (await res.json()) as { date?: string|null; fournisseur?: string|null; montant?: number|null; libelle?: string|null; error?: string };
            if (!data.error && (data.date || data.fournisseur || data.montant)) {
              setInvoice({
                date: data.date ?? "",
                fournisseur: data.fournisseur ? data.fournisseur.toUpperCase().slice(0, 50) : "",
                montant: typeof data.montant === "number" ? data.montant.toFixed(2) : "",
                libelle: data.libelle ? data.libelle.toUpperCase() : "",
              });
              setProgress(100);
              return;
            }
          }
        } catch { /* continuer avec OCR */ }
        if (activeProcessRef.current !== processId) return;
      }

      // ── PDF natif ───────────────────────────────────────────────────────
      if (!preCanvas && picked.type === "application/pdf") {
        setProgress(10);
        const pdfjs = await ensurePdfJsLoaded();
        if (activeProcessRef.current !== processId) return;
        const arrayBuffer = await picked.arrayBuffer();
        const pdf = await (pdfjs as unknown as { getDocument: (s: { data: ArrayBuffer }) => PdfGetDocumentResult }).getDocument({ data: arrayBuffer }).promise;
        if (activeProcessRef.current !== processId) return;
        try {
          const numPages = Math.min((pdf as unknown as { numPages: number }).numPages, 3);
          let nativeText = "";
          for (let p = 1; p <= numPages; p++) {
            const pg = await pdf.getPage(p);
            const tc = await pg.getTextContent();
            nativeText += tc.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("") + "\n";
          }
          if (activeProcessRef.current !== processId) return;
          if (nativeText.trim().length > 80) {
            setProgress(50);
            await parseAndSet(nativeText, processId);
            return;
          }
        } catch { /* PDF scanné */ }
        setProgress(20);
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const pdfCanvas = document.createElement("canvas");
        pdfCanvas.width = Math.round(viewport.width); pdfCanvas.height = Math.round(viewport.height);
        const pdfCtx = pdfCanvas.getContext("2d");
        if (!pdfCtx) throw new Error("Canvas unavailable");
        await page.render({ canvasContext: pdfCtx, viewport }).promise;
        if (activeProcessRef.current !== processId) return;
        sourceCanvas = pdfCanvas;
      } else if (!preCanvas) {
        setProgress(5);
        sourceCanvas = await preprocessImageFileToCanvas(picked);
        if (activeProcessRef.current !== processId) return;
      }

      if (!sourceCanvas) throw new Error("Pas de canvas source");

      // ── OCR Tesseract ──────────────────────────────────────────────────
      setProgress(15);
      const MAX_PX = 1400;
      const bigSide = Math.max(sourceCanvas.width, sourceCanvas.height);
      if (bigSide > MAX_PX) {
        const r = MAX_PX / bigSide;
        const small = document.createElement("canvas");
        small.width = Math.round(sourceCanvas.width * r); small.height = Math.round(sourceCanvas.height * r);
        const sCtx = small.getContext("2d");
        if (sCtx) { sCtx.imageSmoothingEnabled = true; sCtx.imageSmoothingQuality = "high"; sCtx.fillStyle = "white"; sCtx.fillRect(0, 0, small.width, small.height); sCtx.drawImage(sourceCanvas, 0, 0, small.width, small.height); sourceCanvas = small; }
      }
      sharpenCanvas(sourceCanvas);
      const binaryCanvas = cloneCanvas(sourceCanvas);
      if (binaryCanvas) preprocessCanvasForOcr(binaryCanvas);
      if (activeProcessRef.current !== processId) return;
      setProgress(25);
      const worker = await ensureTesseractWorker();
      if (activeProcessRef.current !== processId) return;
      const dataUrl = (binaryCanvas ?? sourceCanvas).toDataURL("image/png");
      const result = await worker.recognize(dataUrl);
      if (activeProcessRef.current !== processId) return;
      setProgress(75);
      await parseAndSet(result.data.text, processId, sourceCanvas ?? undefined);
    } catch {
      alert("Erreur lors de l'analyse. Remplissez les champs manuellement.");
    } finally {
      if (activeProcessRef.current === processId) setIsProcessing(false);
    }
  }, [ensurePdfJsLoaded, ensureTesseractWorker, parseAndSet]);

  const handleFile = useCallback((f: File) => { void processFile(f); }, [processFile]);

  // ── Caméra ──────────────────────────────────────────────────────────────
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
      streamRef.current = stream;
      setShowCamera(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } }, 100);
    } catch { setCameraError("Caméra non disponible."); }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    stopCamera();
    void processFile(new File([], "camera.jpg"), canvas);
  };

  // ── Sauvegarde ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!invoice.date || !invoice.fournisseur || !invoice.montant || !invoice.libelle) {
      alert("Tous les champs sont obligatoires."); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, date: invoice.date, fournisseur: invoice.fournisseur, montant: invoice.montant, libelle: invoice.libelle }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(data?.error || "Erreur lors de l'enregistrement."); return;
      }
      const data = (await res.json()) as { invoice: { id: string; date: string; fournisseur: string; montant: number; libelle: string; numeroPiece: string; createdAt: string } };
      onInvoiceAdded({ ...data.invoice, date: new Date(data.invoice.date) });
      setOpen(false);
      setPreviewUrl(null);
      setInvoice({ date: "", fournisseur: "", montant: "", libelle: "" });
      setProgress(0);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-700 transition-colors shadow-lg shadow-orange-600/20"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Scanner / Importer
      </button>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
          </div>
          <p className="font-bold text-sm text-slate-900">Scanner une facture — {clientCode}</p>
        </div>
        <button type="button" onClick={() => { setOpen(false); stopCamera(); setPreviewUrl(null); setInvoice({ date: "", fournisseur: "", montant: "", libelle: "" }); }}
          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Caméra */}
      {showCamera ? (
        <div className="space-y-3">
          <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
            <video ref={videoRef} playsInline className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={capturePhoto} className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-700 transition-colors">
              📸 Prendre la photo
            </button>
            <button type="button" onClick={stopCamera} className="bg-slate-100 text-slate-600 px-4 py-3 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Zone de drop */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-all"
          >
            <svg className="mx-auto mb-2 text-slate-400" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className="text-xs font-semibold text-slate-600">Importer</p>
            <p className="text-[10px] text-slate-400 mt-0.5">PDF, JPG, PNG</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

          {/* Caméra */}
          <button type="button" onClick={() => void startCamera()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center hover:border-orange-400 hover:bg-orange-50 transition-all">
            <svg className="mx-auto mb-2 text-slate-400" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
            <p className="text-xs font-semibold text-slate-600">Caméra</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Scanner direct</p>
          </button>
          {cameraError && <p className="col-span-2 text-xs text-red-500 text-center">{cameraError}</p>}
        </div>
      )}

      {/* Progress */}
      {isProcessing && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Analyse IA en cours...</p>
            <p className="text-xs font-bold text-orange-600">{progress}%</p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Preview + Champs */}
      {previewUrl && !isProcessing && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl overflow-hidden border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Facture" className="w-full h-48 object-contain bg-slate-50" />
          </div>
          <div className="space-y-2">
            {(["date", "fournisseur", "montant", "libelle"] as (keyof InvoiceInput)[]).map((field) => (
              <div key={field}>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                  {field === "montant" ? "Montant TTC" : field.charAt(0).toUpperCase() + field.slice(1)}
                </label>
                <input
                  value={invoice[field]}
                  onChange={(e) => setInvoice((s) => ({ ...s, [field]: e.target.value }))}
                  placeholder={field === "date" ? "JJ/MM/AAAA" : field === "montant" ? "0.00" : ""}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-orange-500 focus:bg-white transition-all"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !invoice.date || !invoice.fournisseur || !invoice.montant || !invoice.libelle}
              className="w-full bg-orange-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-orange-700 disabled:opacity-40 transition-colors mt-1"
            >
              {saving ? "Enregistrement..." : "✓ Valider"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
