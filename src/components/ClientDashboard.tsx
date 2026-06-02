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

/** Applique un filtre de netteté (unsharp mask léger) pour améliorer la lisibilité du texte */
const sharpenCanvas = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dst = ctx.createImageData(src.width, src.height);
  const d = src.data;
  const o = dst.data;
  const w = src.width;
  const h = src.height;
  // Noyau de netteté : centre renforcé, bords atténués
  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const ki = ((y + ky) * w + (x + kx)) * 4;
          const kv = k[(ky + 1) * 3 + (kx + 1)];
          r += d[ki] * kv;
          g += d[ki + 1] * kv;
          b += d[ki + 2] * kv;
        }
      }
      o[i] = Math.max(0, Math.min(255, r));
      o[i + 1] = Math.max(0, Math.min(255, g));
      o[i + 2] = Math.max(0, Math.min(255, b));
      o[i + 3] = 255;
    }
  }
  // Bords : copie directe
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = (y * w + x) * 4;
      o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; o[i + 3] = d[i + 3];
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = (y * w + x) * 4;
      o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; o[i + 3] = d[i + 3];
    }
  }
  ctx.putImageData(dst, 0, 0);
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
      const maxWidth = 1500;
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
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pdfjsRef = useRef<PdfJs | null>(null);
  const pdfjsLoadRef = useRef<Promise<PdfJs> | null>(null);
  const tesseractWorkerRef = useRef<Tesseract.Worker | null>(null);
  const tesseractLoadRef = useRef<Promise<Tesseract.Worker> | null>(null);
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

  /** Charge le worker Tesseract une seule fois et le réutilise pour tous les scans */
  const ensureTesseractWorker = useCallback(async () => {
    if (tesseractWorkerRef.current) return tesseractWorkerRef.current;
    if (!tesseractLoadRef.current) {
      tesseractLoadRef.current = Tesseract.createWorker("fra", 1)
        .then((w) => { tesseractWorkerRef.current = w; return w; })
        .catch((e) => { tesseractLoadRef.current = null; throw e; });
    }
    return await tesseractLoadRef.current;
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

  // Précharge le worker Tesseract dès le montage pour que le premier scan soit rapide
  useEffect(() => {
    void ensureTesseractWorker().catch(() => { /* silencieux */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Termine le worker quand le composant est démonté
  useEffect(() => {
    return () => {
      void tesseractWorkerRef.current?.terminate();
      tesseractWorkerRef.current = null;
      tesseractLoadRef.current = null;
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
      // Demande la résolution maximale disponible (4K idéalement, sinon la meilleure dispo)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      });
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
    setCaptureCountdown(null);
  }, []);

  const capturePhoto = useCallback(() => {
    // Compte à rebours de 2 secondes pour stabiliser la caméra
    setCaptureCountdown(2);
    const tick = (n: number) => {
      if (n <= 0) {
        setCaptureCountdown(null);
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        closeCamera();
        // Traitement direct — pas de cadrage manuel
        const fileName = `scan-${Date.now()}.jpg`;
        canvas.toBlob(
          (blob) => {
            if (!blob) return;
            const file = new File([blob], fileName, { type: "image/jpeg" });
            setFile(file);
            setPreviewUrl(URL.createObjectURL(blob));
            void processFile(file, canvas);
          },
          "image/jpeg",
          0.95,
        );
        return;
      }
      setCaptureCountdown(n);
      setTimeout(() => tick(n - 1), 1000);
    };
    setTimeout(() => tick(1), 1000);
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

  /**
   * Envoie le texte OCR à Gemini pour extraction précise, fallback regex si indisponible.
   */
  const parseAndSetInvoice = useCallback(async (text: string, processId: number, canvas?: HTMLCanvasElement) => {
    if (activeProcessRef.current !== processId) return;
    try {
      // Envoyer l'image ET le texte OCR : Gemini Vision utilise l'image en priorité
      // (bien meilleur pour les factures photo/scan), le texte OCR sert de fallback.
      let body: Record<string, unknown>;
      if (canvas) {
        // Redimensionner à max 1600px pour rester sous la limite Gemini (4MB base64)
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
        const imageBase64 = dataUrl.split(",")[1];
        body = { imageBase64, mediaType: "image/jpeg", ocrText: text };
      } else {
        body = { ocrText: text };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
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
            setOcrConfidence(99);
            setInvoice({
              date: data.date ?? "",
              fournisseur: data.fournisseur ? data.fournisseur.toUpperCase().slice(0, 50) : "",
              montant: typeof data.montant === "number" ? data.montant.toFixed(2) : "",
              libelle: data.libelle ? data.libelle.toUpperCase() : "",
            });
            setProgress(100);
            return;
          } else {
            setOcrRawText((prev) => prev + "\n[Gemini error: " + data.error + "]");
          }
        } else {
          clearTimeout(timer);
          const errText = await res.text().catch(() => "");
          setOcrRawText((prev) => prev + "\n[API " + res.status + ": " + errText.slice(0, 100) + "]");
        }
      } catch (e) {
        clearTimeout(timer);
        setOcrRawText((prev) => prev + "\n[Fetch error: " + String(e).slice(0, 100) + "]");
      }
    } catch { /* fallback ci-dessous */ }
    // Fallback regex local
    if (activeProcessRef.current !== processId) return;
    const p = parseInvoice(text);
    setInvoice({
      date: p.date ?? "",
      fournisseur: p.fournisseur ? p.fournisseur.toUpperCase().slice(0, 50) : "",
      montant: p.montant === null ? "" : p.montant.toFixed(2),
      libelle: p.libelle ? p.libelle.toUpperCase() : "",
    });
    setProgress(100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processFile = async (picked: File, preCanvas?: HTMLCanvasElement) => {
    const processId = ++processSeqRef.current;
    activeProcessRef.current = processId;
    setIsProcessing(true);
    setProgress(0);
    setOcrRawText("");
    setOcrConfidence(null);
    try {
      // ── Types partagés PDF ──────────────────────────────────────────────────
      type TextItem = { str: string; hasEOL?: boolean };
      type TextContent = { items: TextItem[] };
      type PdfViewport = { height: number; width: number };
      type PdfPage = {
        getViewport: (options: { scale: number }) => PdfViewport;
        render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
        getTextContent: () => Promise<TextContent>;
      };
      type PdfDocument = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
      type PdfGetDocumentResult = { promise: Promise<PdfDocument> };

      let sourceCanvas: HTMLCanvasElement | null = preCanvas ?? null;

      // ── GEMINI VISION DIRECT : envoyer le fichier original avant tout traitement ──
      // Pour les images (pas les PDF), on envoie directement le fichier brut à Gemini.
      // C'est bien plus précis que l'image binarisée utilisée pour l'OCR.
      if (!preCanvas && picked.type.startsWith("image/")) {
        setProgress(10);
        try {
          const arrayBuffer = await picked.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
          const imageBase64 = btoa(binary);
          const mediaType = picked.type || "image/jpeg";

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 18000);
          const res = await fetch("/api/parse-invoice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64, mediaType }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok && activeProcessRef.current === processId) {
            const data = (await res.json()) as { date?: string|null; fournisseur?: string|null; montant?: number|null; libelle?: string|null; error?: string };
            if (!data.error && (data.date || data.fournisseur || data.montant)) {
              setOcrConfidence(99);
              setInvoice({
                date: data.date ?? "",
                fournisseur: data.fournisseur ? data.fournisseur.toUpperCase().slice(0, 50) : "",
                montant: typeof data.montant === "number" ? data.montant.toFixed(2) : "",
                libelle: data.libelle ? data.libelle.toUpperCase() : "",
              });
              setProgress(100);
              return; // Gemini Vision a réussi → pas besoin d'OCR
            }
          }
        } catch { /* Gemini Vision a échoué → continuer avec OCR */ }
        if (activeProcessRef.current !== processId) return;
      }

      // ── PDF numérique : texte natif (instantané) ─────────────────────────────
      if (!preCanvas && picked.type === "application/pdf") {
        setProgress(10);
        const pdfjs = await ensurePdfJsLoaded();
        if (activeProcessRef.current !== processId) return;
        const arrayBuffer = await picked.arrayBuffer();
        if (activeProcessRef.current !== processId) return;
        const pdf = await (pdfjs as unknown as { getDocument: (s: { data: ArrayBuffer }) => PdfGetDocumentResult })
          .getDocument({ data: arrayBuffer }).promise;
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
            setOcrRawText(nativeText);
            setOcrConfidence(99);
            await parseAndSetInvoice(nativeText, processId);
            return;
          }
        } catch { /* PDF scanné → continuer */ }

        // PDF scanné → canvas
        setProgress(20);
        const page = await pdf.getPage(1);
        if (activeProcessRef.current !== processId) return;
        const viewport = page.getViewport({ scale: 2.0 });
        const pdfCanvas = document.createElement("canvas");
        pdfCanvas.width = Math.round(viewport.width);
        pdfCanvas.height = Math.round(viewport.height);
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

      // ── Tesseract OCR ─────────────────────────────────────────────────────────
      setProgress(15);
      const MAX_PX = 1400;
      const bigSide = Math.max(sourceCanvas.width, sourceCanvas.height);
      if (bigSide > MAX_PX) {
        const r = MAX_PX / bigSide;
        const small = document.createElement("canvas");
        small.width = Math.round(sourceCanvas.width * r);
        small.height = Math.round(sourceCanvas.height * r);
        const sCtx = small.getContext("2d");
        if (sCtx) {
          sCtx.imageSmoothingEnabled = true;
          sCtx.imageSmoothingQuality = "high";
          sCtx.fillStyle = "white";
          sCtx.fillRect(0, 0, small.width, small.height);
          sCtx.drawImage(sourceCanvas, 0, 0, small.width, small.height);
          sourceCanvas = small;
        }
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

      const ocrText = result.data.text;
      setProgress(75);
      setOcrRawText(ocrText);
      setOcrConfidence(Math.round(result.data.confidence));

      // ── Gemini analyse le texte OCR (plus rapide qu'envoyer une image) ───────
      await parseAndSetInvoice(ocrText, processId, sourceCanvas ?? undefined);

    } catch {
      alert("Erreur lors de l\'analyse. Veuillez remplir les champs manuellement.");
    } finally {
      if (activeProcessRef.current === processId) setIsProcessing(false);
    }
  };




  const canSave = useMemo(() => {
    return !isProcessing && !!fileUrl && invoice.date.trim() && invoice.fournisseur.trim() && invoice.montant.trim() && invoice.libelle.trim();
  }, [fileUrl, invoice, isProcessing]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 px-6 h-16 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/40">
            <span className="text-white font-black text-sm">A</span>
          </div>
          <div>
            <p className="text-white font-black text-sm leading-none">Espace client</p>
            <p className="text-slate-500 text-[11px] mt-0.5">{clientCode}</p>
          </div>
        </div>
        <LogoutButton />
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-3 sm:gap-5 p-3 sm:p-5">
        <div className="space-y-5">
          {!fileUrl ? (
            <div
              onDragEnter={onDropzoneDragEnter}
              onDragOver={onDropzoneDragOver}
              onDragLeave={onDropzoneDragLeave}
              onDrop={onDropzoneDrop}
              className={`w-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all p-6 sm:p-12 bg-white ${isDragActive ? "border-orange-500 bg-orange-50/30" : "border-slate-200 hover:border-slate-300"}`}
            >
              <input ref={mainFileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => void onMainFileInputChange(e)} />
              <div className="flex items-center gap-2 mb-4 sm:mb-5">
                <div className="w-10 h-12 bg-red-50 border border-red-100 rounded-lg flex flex-col items-center justify-center gap-0.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="text-[8px] font-black text-red-400">PDF</span>
                </div>
                <div className="w-10 h-12 bg-blue-50 border border-blue-100 rounded-lg flex flex-col items-center justify-center gap-0.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span className="text-[8px] font-black text-blue-400">IMG</span>
                </div>
              </div>
              <h2 className="text-lg font-black text-slate-900 mb-1">Importer une facture</h2>
              <p className="text-slate-400 text-sm text-center mb-5 sm:mb-7">Glissez un fichier ici ou choisissez une option ci-dessous</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => mainFileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 bg-orange-600 text-white py-2.5 px-5 rounded-xl font-bold text-sm hover:bg-orange-700 transition-colors shadow-sm shadow-orange-600/20"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Choisir un fichier
                </button>
                <button
                  type="button"
                  onClick={() => void openCamera()}
                  className={`flex items-center justify-center gap-2 bg-slate-800 text-white py-2.5 px-5 rounded-xl font-bold text-sm hover:bg-slate-900 transition-colors${isProcessing ? " animate-pulse" : ""}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Scanner par caméra
                </button>
              </div>
              <p className="text-xs text-slate-300 mt-5">PDF, JPG, PNG, WebP et autres formats images</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 truncate">{file?.name}</span>
                </div>
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
                  className="flex-shrink-0 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-slate-200 transition-colors"
                >
                  Fermer
                </button>
              </div>
              <div className="bg-slate-800 p-3 h-56 sm:h-[500px] flex items-center justify-center">
                {file?.type === "application/pdf" ? (
                  <iframe title="Facture PDF" src={fileUrl} className="w-full h-full rounded-lg shadow-xl" />
                ) : (
                  <div className="relative w-full h-full">
                    <Image src={fileUrl || ""} alt="Facture" fill unoptimized className="object-contain" />
                  </div>
                )}
              </div>
            </div>
          )}

          {invoices.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total factures</p>
                <p className="text-2xl font-black text-emerald-600">
                  {invoices.reduce((s, inv) => s + inv.montant, 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Documents</p>
                <p className="text-2xl font-black text-slate-900">{invoices.length}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900">Factures enregistrées</h2>
              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{invoices.length}</span>
            </div>
            {invoices.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-slate-400 text-sm">Aucune facture enregistrée</p>
              </div>
            ) : (
              <div className="max-h-[320px] overflow-auto">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-slate-900 truncate">{inv.numeroPiece} — {inv.fournisseur}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{inv.date} · {inv.libelle}</p>
                    </div>
                    <div className="font-mono font-black text-sm text-slate-900 flex-shrink-0">
                      {inv.montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
          {isProcessing && (
            <div className="h-1 bg-slate-100 rounded-t-2xl overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">Données extraites</h2>
              <p className="text-xs text-slate-400 mt-0.5">Vérifiez et corrigez avant d&apos;enregistrer</p>
            </div>
            {isProcessing && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-orange-600">{progress}%</span>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-5 space-y-4 flex-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
              <input
                value={invoice.date}
                onChange={(e) => setInvoice((p) => ({ ...p, date: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
                placeholder="JJ/MM/AAAA"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Fournisseur</label>
              <input
                value={invoice.fournisseur}
                onChange={(e) => setInvoice((p) => ({ ...p, fournisseur: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Montant TTC (Crédit)</label>
              <input
                value={invoice.montant}
                onChange={(e) => setInvoice((p) => ({ ...p, montant: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono font-bold outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Libellé</label>
              <textarea
                value={invoice.libelle}
                onChange={(e) => setInvoice((p) => ({ ...p, libelle: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all min-h-[100px] resize-none"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowOcrRawText((v) => !v)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40"
                disabled={!ocrRawText}
              >
                {showOcrRawText ? "Masquer texte OCR" : "Voir texte brut OCR"}
              </button>
              {ocrConfidence !== null && (
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${ocrConfidence >= 70 ? "bg-emerald-50 text-emerald-600" : ocrConfidence >= 50 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
                    Confiance : {ocrConfidence}%
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${ocrConfidence >= 80 ? "bg-emerald-100 text-emerald-700" : ocrConfidence >= 60 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                    {ocrConfidence >= 80 ? "Excellent" : ocrConfidence >= 60 ? "Bon" : "Faible"}
                  </span>
                </div>
              )}
            </div>

            {showOcrRawText && (
              <pre className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs whitespace-pre-wrap max-h-[200px] overflow-auto text-slate-600">
                {ocrRawText}
              </pre>
            )}
          </div>

          <div className="px-4 sm:px-5 pb-4 sm:pb-5">
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
                    setInvoices((prev) => [row, ...prev]);
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
              className="w-full bg-orange-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors shadow-sm shadow-orange-600/20"
            >
              {saving ? "Enregistrement..." : "Valider et enregistrer"}
            </button>
          </div>
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
                {/* Zone vidéo avec cadre de guidage */}
                <div className="relative w-full bg-black" style={{ maxHeight: "60vh", minHeight: "240px" }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full object-cover"
                    style={{ maxHeight: "60vh" }}
                  />
                  {/* Cadre de guidage pour positionner la facture */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="border-2 border-orange-400 rounded-lg opacity-80"
                      style={{ width: "85%", height: "75%" }}>
                      <div className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-4 border-l-4 border-orange-400 rounded-tl" />
                      <div className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-4 border-r-4 border-orange-400 rounded-tr" />
                      <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-4 border-l-4 border-orange-400 rounded-bl" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-4 border-r-4 border-orange-400 rounded-br" />
                    </div>
                  </div>
                  {/* Compte à rebours */}
                  {captureCountdown !== null && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                      <span className="text-white font-black text-7xl opacity-90 drop-shadow-lg">{captureCountdown}</span>
                    </div>
                  )}
                </div>
                {/* Conseils + bouton capture */}
                <div className="bg-zinc-900 px-4 pt-3 pb-1 text-center">
                  <p className="text-zinc-400 text-[11px] mb-3">
                    📄 Cadrez la facture dans le rectangle · bonne lumière · tenez stable
                  </p>
                </div>
                <div className="flex items-center justify-center pb-5 bg-zinc-900">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    disabled={captureCountdown !== null}
                    className="w-16 h-16 rounded-full bg-white hover:bg-orange-100 transition-colors flex items-center justify-center shadow-xl disabled:opacity-50"
                    aria-label="Prendre une photo"
                  >
                    {captureCountdown !== null ? (
                      <span className="text-orange-600 font-black text-xl">{captureCountdown}</span>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-orange-600" />
                    )}
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
