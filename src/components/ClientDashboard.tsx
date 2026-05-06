"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as Tesseract from "tesseract.js";
import { parseInvoice } from "@/lib/parseInvoice";
import LogoutButton from "@/components/LogoutButton";

type PdfJs = typeof import("pdfjs-dist");

type InvoiceInput = {
  date: string;
  fournisseur: string;
  montant: string;
  libelle: string;
};

type InvoiceRow = {
  id: string;
  date: string;
  fournisseur: string;
  montant: number;
  libelle: string;
  numeroPiece: string;
  createdAt: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatDdMmYyyy = (d: Date) => `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

type BitmapClosable = { close?: () => void };

const cloneCanvas = (source: HTMLCanvasElement) => {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return canvas;
  } catch {
    return null;
  }
};

const rotateCanvasToDataUrl = (source: HTMLCanvasElement, angle: 0 | 90 | 180 | 270) => {
  if (angle === 0) return source.toDataURL("image/png");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return source.toDataURL("image/png");
  const w = source.width;
  const h = source.height;
  if (angle === 90 || angle === 270) {
    canvas.width = h;
    canvas.height = w;
  } else {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2);
  return canvas.toDataURL("image/png");
};

const preprocessCanvasForOcrSoft = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const contrast = 45;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let v = factor * (gray - 128) + 128;
    v = Math.max(0, Math.min(255, v + 10));
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
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
    const r = image.data[i];
    const g = image.data[i + 1];
    const b = image.data[i + 2];

    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let v = factor * (gray - 128) + 128;
    v = Math.max(0, Math.min(255, v + 12));

    const gv = v | 0;
    grayValues[p] = gv;
    histogram[gv]++;
  }

  const total = grayValues.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVar = -1;
  let threshold = 160;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  for (let i = 0, p = 0; i < image.data.length; i += 4, p++) {
    const v = grayValues[p] > threshold ? 255 : 0;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
};

const preprocessImageFileToCanvas = async (file: File) => {
  const url = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    img.decoding = "async";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Impossible de charger l'image"));
    });

    const bitmap = await createImageBitmap(img);
    try {
      const maxWidth = 1700;
      const ratio = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
      const width = Math.round(bitmap.width * ratio);
      const height = Math.round(bitmap.height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Impossible de créer le contexte canvas");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, width, height);
      (bitmap as unknown as BitmapClosable).close?.();
      return canvas;
    } finally {
      (bitmap as unknown as BitmapClosable).close?.();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
};

export default function ClientDashboard({ clientCode }: { clientCode: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const mainFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrRawText, setOcrRawText] = useState("");
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [showOcrRawText, setShowOcrRawText] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceInput>({ date: "", fournisseur: "", montant: "", libelle: "" });
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pdfjsRef = useRef<PdfJs | null>(null);
  const pdfjsLoadRef = useRef<Promise<PdfJs> | null>(null);
  const fileUrlToRevokeRef = useRef<string | null>(null);
  const processSeqRef = useRef(0);
  const activeProcessRef = useRef(0);

  const ensurePdfJsLoaded = useCallback(async () => {
    if (pdfjsRef.current) return pdfjsRef.current;
    if (!pdfjsLoadRef.current) {
      pdfjsLoadRef.current = import("pdfjs-dist")
        .then((pdfjs) => {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
          pdfjsRef.current = pdfjs;
          return pdfjs;
        })
        .catch((e) => {
          pdfjsLoadRef.current = null;
          throw e;
        });
    }
    return await pdfjsLoadRef.current;
  }, []);

  const setPreviewUrl = useCallback((nextUrl: string | null) => {
    const prev = fileUrlToRevokeRef.current;
    if (prev && prev.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(prev);
      } catch {
      }
    }
    fileUrlToRevokeRef.current = nextUrl;
    setFileUrl(nextUrl);
  }, []);

  useEffect(() => {
    return () => {
      const prev = fileUrlToRevokeRef.current;
      if (prev && prev.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(prev);
        } catch {
        }
      }
      fileUrlToRevokeRef.current = null;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/invoices");
      const data = (await res.json().catch(() => null)) as { invoices?: Array<{ id: string; date: string; fournisseur: string; montant: number; libelle: string; numeroPiece: string; createdAt: string }> } | null;
      if (!res.ok) return;
      const mapped = (data?.invoices || []).map((inv) => ({
        ...inv,
        date: formatDdMmYyyy(new Date(inv.date)),
      }));
      setInvoices(mapped);
    })();
  }, []);

  const openCamera = useCallback(async () => {
    setCameraError(null);
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
    }
  }, []);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setShowCamera(false);
    setCameraError(null);
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const captured = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
      closeCamera();
      await handlePickedInvoiceFile(captured);
    }, "image/jpeg", 0.95);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeCamera]);

  const isAcceptedInvoiceFile = (picked: File) => {
    const name = (picked?.name || "").toLowerCase();
    const isPdf = picked?.type === "application/pdf" || name.endsWith(".pdf");
    const isImage = picked?.type?.startsWith("image/") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".webp") || name.endsWith(".bmp") || name.endsWith(".tiff") || name.endsWith(".tif") || name.endsWith(".heic");
    return isPdf || isImage;
  };

  const handlePickedInvoiceFile = async (picked: File) => {
    if (!isAcceptedInvoiceFile(picked)) {
      alert("Formats acceptés : PDF, JPG, PNG.");
      return;
    }
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    await processFile(picked);
  };

  const onMainFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    await handlePickedInvoiceFile(picked);
  };

  const onDropzoneDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDropzoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDropzoneDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const onDropzoneDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const picked = e.dataTransfer.files?.[0];
    if (!picked) return;
    void handlePickedInvoiceFile(picked);
  };

  const processFile = async (picked: File) => {
    const processId = ++processSeqRef.current;
    activeProcessRef.current = processId;
    setIsProcessing(true);
    setProgress(0);
    setOcrRawText("");
    setOcrConfidence(null);
    try {
      let sourceCanvas: HTMLCanvasElement | null = null;

      if (picked.type === "application/pdf") {
        const pdfjs = await ensurePdfJsLoaded();
        if (activeProcessRef.current !== processId) return;

        const arrayBuffer = await picked.arrayBuffer();
        if (activeProcessRef.current !== processId) return;

        type PdfViewport = { height: number; width: number };
        type PdfPage = {
          getViewport: (options: { scale: number }) => PdfViewport;
          render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
        };
        type PdfDocument = { getPage: (pageNumber: number) => Promise<PdfPage> };
        type PdfGetDocumentResult = { promise: Promise<PdfDocument> };

        const pdf = await (pdfjs as unknown as { getDocument: (source: { data: ArrayBuffer }) => PdfGetDocumentResult })
          .getDocument({ data: arrayBuffer })
          .promise;
        if (activeProcessRef.current !== processId) return;
        const page = await pdf.getPage(1);
        if (activeProcessRef.current !== processId) return;
        const baseViewport = page.getViewport({ scale: 1.0 });
        const targetWidth = 1700;
        const scale = Math.min(3, targetWidth / baseViewport.width);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Impossible de créer le contexte canvas");

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        if (activeProcessRef.current !== processId) return;
        sourceCanvas = canvas;
      } else {
        sourceCanvas = await preprocessImageFileToCanvas(picked);
        if (activeProcessRef.current !== processId) return;
      }

      const worker = await Tesseract.createWorker("fra+eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      if (activeProcessRef.current !== processId) {
        await worker.terminate();
        return;
      }

      let bestText = "";
      let bestConfidence = -1;

      const portrait = sourceCanvas.height > sourceCanvas.width;
      const angles: Array<0 | 90 | 180 | 270> = portrait ? [0, 180, 90, 270] : [0, 180];

      const recognizeCandidate = async (canvas: HTMLCanvasElement, angle: 0 | 90 | 180 | 270) => {
        const result = await worker.recognize(rotateCanvasToDataUrl(canvas, angle));
        if (activeProcessRef.current !== processId) return -1;
        const conf = typeof result?.data?.confidence === "number" ? result.data.confidence : -1;
        const text = result?.data?.text || "";
        if (conf > bestConfidence) {
          bestConfidence = conf;
          bestText = text;
        }
        return conf;
      };

      const softCanvas = cloneCanvas(sourceCanvas) || sourceCanvas;
      preprocessCanvasForOcrSoft(softCanvas);
      for (const angle of angles) {
        const conf = await recognizeCandidate(softCanvas, angle);
        if (conf >= 72) break;
      }

      if (bestConfidence < 60) {
        const binCanvas = cloneCanvas(sourceCanvas) || sourceCanvas;
        preprocessCanvasForOcr(binCanvas);
        for (const angle of angles) {
          const conf = await recognizeCandidate(binCanvas, angle);
          if (conf >= 72) break;
        }
      }

      await worker.terminate();
      if (activeProcessRef.current !== processId) return;

      setOcrRawText(bestText);
      setOcrConfidence(bestConfidence >= 0 ? Math.round(bestConfidence) : null);

      const parsed = parseInvoice(bestText);
      setInvoice({
        date: parsed.date ?? "",
        fournisseur: parsed.fournisseur ? parsed.fournisseur.toUpperCase().slice(0, 50) : "",
        montant: parsed.montant === null ? "" : parsed.montant.toFixed(2),
        libelle: parsed.libelle ? parsed.libelle.toUpperCase() : "",
      });
    } catch {
      alert("Erreur lors de l'analyse de la facture. Veuillez remplir les champs manuellement.");
    } finally {
      if (activeProcessRef.current === processId) setIsProcessing(false);
    }
  };

  const canSave = useMemo(() => {
    return !isProcessing && !!fileUrl && invoice.date.trim() && invoice.fournisseur.trim() && invoice.montant.trim() && invoice.libelle.trim();
  }, [fileUrl, invoice, isProcessing]);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">Espace client</h1>
          <p className="text-xs text-zinc-500 font-bold">{clientCode}</p>
        </div>
        <LogoutButton />
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 p-6">
        <div className="space-y-6">
          {!fileUrl ? (
            <div
              onDragEnter={onDropzoneDragEnter}
              onDragOver={onDropzoneDragOver}
              onDragLeave={onDropzoneDragLeave}
              onDrop={onDropzoneDrop}
              className={`w-full border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all p-10 bg-white ${isDragActive ? "border-orange-500 bg-orange-50/50" : "border-zinc-300"}`}
            >
              <input ref={mainFileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => void onMainFileInputChange(e)} />
              <h2 className="text-2xl font-black mb-2">Importer une facture</h2>
              <p className="text-zinc-500 text-center mb-6">Glissez un fichier ici ou choisissez une option.</p>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => mainFileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-orange-600 text-white py-3 px-4 rounded-2xl font-black hover:bg-orange-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Fichier
                </button>
                <button
                  type="button"
                  onClick={() => void openCamera()}
                  className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 text-white py-3 px-4 rounded-2xl font-black hover:bg-zinc-900 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Caméra
                </button>
              </div>
              <p className="text-xs text-zinc-400 mt-4">PDF, JPG, PNG, WebP et plus</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-3 bg-zinc-50">
                <div className="text-sm font-bold truncate">{file?.name}</div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPreviewUrl(null);
                    setInvoice({ date: "", fournisseur: "", montant: "", libelle: "" });
                    setOcrRawText("");
                    setOcrConfidence(null);
                    setShowOcrRawText(false);
                  }}
                  className="border border-zinc-200 bg-white px-3 py-1.5 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
                >
                  Fermer
                </button>
              </div>
              <div className="bg-zinc-800 p-4 h-[520px] flex items-center justify-center">
                {file?.type === "application/pdf" ? (
                  <iframe title="Facture PDF" src={fileUrl} className="w-full h-full rounded shadow-lg" />
                ) : (
                  <div className="relative w-full h-full">
                    <Image src={fileUrl || ""} alt="Facture" fill unoptimized className="object-contain shadow-2xl" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white border border-zinc-200 rounded-2xl p-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500 mb-3">Factures enregistrées</h2>
            {invoices.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucune facture.</p>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-auto pr-2">
                {invoices.map((inv) => (
                  <div key={inv.id} className="border border-zinc-100 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-sm">{inv.numeroPiece} — {inv.fournisseur}</p>
                      <p className="text-xs text-zinc-500">{inv.date} • {inv.libelle}</p>
                    </div>
                    <div className="font-mono font-black text-sm">
                      {inv.montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500">Extraction</h2>
            {isProcessing && <span className="text-xs font-black text-orange-700">{progress}%</span>}
          </div>

          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1">Date</label>
            <input
              value={invoice.date}
              onChange={(e) => setInvoice((p) => ({ ...p, date: e.target.value }))}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 outline-none focus:bg-white focus:border-orange-500"
              placeholder="JJ/MM/AAAA"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1">Fournisseur</label>
            <input
              value={invoice.fournisseur}
              onChange={(e) => setInvoice((p) => ({ ...p, fournisseur: e.target.value }))}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 outline-none focus:bg-white focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1">Montant TTC (Crédit)</label>
            <input
              value={invoice.montant}
              onChange={(e) => setInvoice((p) => ({ ...p, montant: e.target.value }))}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 outline-none focus:bg-white focus:border-orange-500 font-mono font-bold"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1">Libellé</label>
            <textarea
              value={invoice.libelle}
              onChange={(e) => setInvoice((p) => ({ ...p, libelle: e.target.value }))}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-3 outline-none focus:bg-white focus:border-orange-500 min-h-[120px] resize-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowOcrRawText((v) => !v)}
              className="border border-zinc-200 bg-white px-4 py-2 rounded-full font-bold text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
              disabled={!ocrRawText}
            >
              {showOcrRawText ? "Masquer texte OCR" : "Voir texte OCR"}
            </button>
            <span className="text-xs text-zinc-500 font-bold">Confiance: {ocrConfidence === null ? "—" : `${ocrConfidence}%`}</span>
          </div>

          {showOcrRawText && (
            <pre className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-xs whitespace-pre-wrap max-h-[200px] overflow-auto">
              {ocrRawText}
            </pre>
          )}

          <button
            type="button"
            disabled={!canSave || saving}
            onClick={async () => {
              if (!file) return;
              setSaving(true);
              try {
                const res = await fetch("/api/invoices", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...invoice, fileName: file.name }),
                });
                const data = (await res.json().catch(() => null)) as unknown;
                if (!res.ok) {
                  const err = (data && typeof data === "object" && "error" in data) ? String((data as { error?: unknown }).error || "") : "";
                  alert(err || "Erreur lors de l'enregistrement.");
                  return;
                }
                const invRaw = (data && typeof data === "object" && "invoice" in data) ? (data as { invoice?: unknown }).invoice : null;
                const inv = (invRaw && typeof invRaw === "object") ? (invRaw as Partial<InvoiceRow> & { date?: string }) : null;
                if (inv?.id && inv?.date && inv?.fournisseur && typeof inv.montant === "number" && inv?.libelle && inv?.numeroPiece && inv?.createdAt) {
                  const row: InvoiceRow = {
                    id: inv.id,
                    date: formatDdMmYyyy(new Date(inv.date)),
                    fournisseur: inv.fournisseur,
                    montant: inv.montant,
                    libelle: inv.libelle,
                    numeroPiece: inv.numeroPiece,
                    createdAt: inv.createdAt,
                  };
                  setInvoices((prev) => [
                    row,
                    ...prev,
                  ]);
                }
                setFile(null);
                setPreviewUrl(null);
                setInvoice({ date: "", fournisseur: "", montant: "", libelle: "" });
                setOcrRawText("");
                setOcrConfidence(null);
                setShowOcrRawText(false);
              } finally {
                setSaving(false);
              }
            }}
            className="w-full bg-orange-600 text-white py-4 rounded-2xl font-black hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors"
          >
            {saving ? "Enregistrement..." : "Valider et enregistrer"}
          </button>
        </div>
      </main>

      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-lg bg-black rounded-3xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-900">
              <span className="text-white font-black text-sm">Scanner par caméra</span>
              <button type="button" onClick={closeCamera} className="text-zinc-400 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {cameraError ? (
              <div className="flex flex-col items-center justify-center p-10 text-center gap-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <p className="text-white text-sm font-bold">{cameraError}</p>
                <button type="button" onClick={closeCamera} className="bg-zinc-700 text-white px-5 py-2 rounded-full font-bold text-sm hover:bg-zinc-600">Fermer</button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full object-cover"
                  style={{ maxHeight: "60vh" }}
                />
                <div className="flex items-center justify-center p-5 bg-zinc-900">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="w-16 h-16 rounded-full bg-white hover:bg-orange-100 transition-colors flex items-center justify-center shadow-xl"
                    aria-label="Prendre une photo"
                  >
                    <div className="w-12 h-12 rounded-full bg-orange-600" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
