"use client";

// Update worker source
import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, Check, AlertCircle, Loader2, X, Trash2, Camera } from 'lucide-react';
import * as Tesseract from 'tesseract.js';
import * as XLSX from 'xlsx';

type PdfJs = typeof import('pdfjs-dist');

// Types
interface InvoiceData {
  client: string;
  id: string;
  date: string;
  fournisseur: string;
  montant: string;
  libelle: string;
}

type ExcelWritable = {
  write: (data: Blob | BufferSource) => Promise<void>;
  close: () => Promise<void>;
};

type ExcelFileHandle = {
  name?: string;
  getFile?: () => Promise<File>;
  createWritable: () => Promise<ExcelWritable>;
  queryPermission?: (options?: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (options?: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
};

const DEFAULT_CLIENTS = ['CLI001'];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrRawText, setOcrRawText] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [showOcrRawText, setShowOcrRawText] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [mobileView, setMobileView] = useState<'scan' | 'form'>('scan');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
  const [client, setClient] = useState('CLI001');
  const [invoiceData, setInvoiceData] = useState<InvoiceData>({
    client: 'CLI001',
    id: '',
    date: '',
    fournisseur: '',
    montant: '',
    libelle: ''
  });
  const [processedInvoices, setProcessedInvoices] = useState<InvoiceData[]>([]);
  const [clients, setClients] = useState<string[]>(DEFAULT_CLIENTS);

  const [newClient, setNewClient] = useState('');
  const [filterClient, setFilterClient] = useState('TOUS');
  const [excelHandle, setExcelHandle] = useState<ExcelFileHandle | null>(null);
  const autoSaveRequestedRef = useRef(false);
  const pdfjsRef = useRef<PdfJs | null>(null);
  const pdfjsLoadRef = useRef<Promise<PdfJs> | null>(null);

  const getClientCode = useCallback((raw: string) => {
    const trimmed = (raw || '').trim().toUpperCase();
    if (!trimmed) return 'CLI001';
    const m = trimmed.match(/^CLI\s*0*([0-9]{1,})$/i);
    if (!m) return 'CLI001';
    const n = Number.parseInt(m[1], 10);
    if (!Number.isFinite(n) || n <= 0) return 'CLI001';
    return `CLI${String(n).padStart(3, '0')}`;
  }, []);

  const isClientCode = useCallback((raw: string) => {
    return /^CLI\d{3,}$/i.test((raw || '').trim());
  }, []);

  const getNextClientCode = useCallback((existing: string[]) => {
    let max = 1;
    existing.forEach((c) => {
      const m = (c || '').trim().toUpperCase().match(/^CLI0*([0-9]{1,})$/);
      if (!m) return;
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    });
    return `CLI${String(max + 1).padStart(3, '0')}`;
  }, []);

  useEffect(() => {
    setClients((prev) => {
      const seen = new Set(prev.map(getClientCode).filter(isClientCode));
      seen.add('CLI001');
      return Array.from(seen);
    });
    setProcessedInvoices((prev) => prev.map((inv) => ({ ...inv, client: getClientCode(inv.client) })));
    setFilterClient((prev) => (prev === 'TOUS' ? prev : (isClientCode(prev) ? getClientCode(prev) : 'TOUS')));
    setClient((prev) => getClientCode(prev));
    setInvoiceData((prev) => ({ ...prev, client: getClientCode(prev.client) }));
  }, [getClientCode, isClientCode]);

  useEffect(() => {
    try {
      const savedInvoices = window.localStorage.getItem('armelia_invoices');
      if (savedInvoices) {
        const parsed: unknown = JSON.parse(savedInvoices);
        if (Array.isArray(parsed)) {
          const normalized = parsed.map((inv) => {
            const obj = (inv && typeof inv === 'object') ? (inv as Record<string, unknown>) : {};
            const id = typeof obj.id === 'string' ? obj.id : '';
            const storedClient = typeof obj.client === 'string' ? obj.client.trim() : '';
            const clientFromId = id.includes('-') ? id.split('-')[0] : '';
            const clientValue = getClientCode(storedClient || clientFromId || 'CLI001');
            return {
              client: clientValue,
              id,
              date: typeof obj.date === 'string' ? obj.date : '',
              fournisseur: typeof obj.fournisseur === 'string' ? obj.fournisseur : '',
              montant: typeof obj.montant === 'string' ? obj.montant : '',
              libelle: typeof obj.libelle === 'string' ? obj.libelle : '',
            } as InvoiceData;
          });
          setProcessedInvoices(normalized);
        }
      }
    } catch {
    }

    try {
      const savedClients = window.localStorage.getItem('armelia_clients');
      if (savedClients) {
        const parsed: unknown = JSON.parse(savedClients);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter((v): v is string => typeof v === 'string')
            .map(v => v.trim().toUpperCase())
            .filter(v => v.length > 0);
          if (normalized.length > 0) {
            const seen = new Set(normalized.map(getClientCode).filter(isClientCode));
            seen.add('CLI001');
            setClients(Array.from(seen));
          } else {
            setClients(DEFAULT_CLIENTS);
          }
        }
      }
    } catch {
    }
  }, [getClientCode, isClientCode]);

  const ensurePdfJsLoaded = useCallback(async () => {
    if (pdfjsRef.current) return pdfjsRef.current;
    if (!pdfjsLoadRef.current) {
      pdfjsLoadRef.current = import('pdfjs-dist')
        .then((pdfjs) => {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
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

  const getSafeSheetName = useCallback((rawName: string, used: Set<string>) => {
    const base = (rawName || 'CLIENT').trim().slice(0, 31).replace(/[\[\]\*\/\\\:\?]/g, ' ');
    let name = base.length > 0 ? base : 'CLIENT';
    if (name.length > 31) name = name.slice(0, 31);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    for (let i = 2; i < 100; i++) {
      const suffix = ` (${i})`;
      const candidate = `${name.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    return `${name.slice(0, 28)}...`;
  }, []);

  const getNextPieceId = useCallback((clientCode: string, invoices: InvoiceData[]) => {
    const code = getClientCode(clientCode);
    let max = 0;
    invoices.forEach((inv) => {
      const invClient = getClientCode(inv.client);
      if (invClient !== code) return;
      const id = (inv.id || '').toUpperCase().trim();
      const m = id.match(new RegExp(`^${code}-([0-9]{1,})$`));
      if (!m) return;
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    });
    const next = max + 1;
    return `${code}-${next.toString().padStart(4, '0')}`;
  }, []);

  const clientOptions = useMemo(() => {
    const seen = new Set<string>();
    const add = (value: string) => {
      const code = getClientCode(value);
      if (!seen.has(code)) seen.add(code);
    };
    clients.forEach(add);
    processedInvoices.forEach(inv => add(inv.client));
    add(client);
    return Array.from(seen).sort((a, b) => {
      const aa = getClientCode(a);
      const bb = getClientCode(b);
      if (aa === 'CLI001' && bb !== 'CLI001') return -1;
      if (bb === 'CLI001' && aa !== 'CLI001') return 1;
      return aa.localeCompare(bb, 'fr', { sensitivity: 'base' });
    });
  }, [clients, processedInvoices, client, getClientCode]);

  const visibleInvoices = useMemo(() => {
    if (filterClient === 'TOUS') return processedInvoices;
    const code = getClientCode(filterClient);
    return processedInvoices.filter(inv => getClientCode(inv.client) === code);
  }, [processedInvoices, filterClient, getClientCode]);

  const buildWorkbook = useCallback((invoices: InvoiceData[]) => {
    const wb = XLSX.utils.book_new();
    const usedSheetNames = new Set<string>();
    const allClients = new Set<string>();
    clients.forEach(c => allClients.add(getClientCode(c)));
    invoices.forEach(inv => allClients.add(getClientCode(inv.client)));

    const grouped = invoices.reduce<Record<string, InvoiceData[]>>((acc, inv) => {
      const key = getClientCode(inv.client);
      acc[key] = acc[key] || [];
      acc[key].push(inv);
      return acc;
    }, {});

    Array.from(allClients).sort().forEach((clientKey) => {
      const invs = grouped[clientKey] || [];
      const worksheetData = invs.map(inv => ({
        'Date': inv.date,
        'Débit': 0,
        'Crédit': parseFloat(inv.montant) || 0,
        'Numéro de pièce': inv.id,
        'Libellé': inv.libelle
      }));
      const ws =
        worksheetData.length > 0
          ? XLSX.utils.json_to_sheet(worksheetData)
          : XLSX.utils.aoa_to_sheet([['Date', 'Débit', 'Crédit', 'Numéro de pièce', 'Libellé']]);
      XLSX.utils.book_append_sheet(wb, ws, getSafeSheetName(clientKey, usedSheetNames));
    });

    return wb;
  }, [clients, getClientCode, getSafeSheetName]);

  const importInvoicesFromExcel = useCallback(async (handle: ExcelFileHandle) => {
    if (!handle.getFile) return;
    const file = await handle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const imported: InvoiceData[] = [];

    const normalizeKey = (k: string) =>
      (k || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

    const getCell = (row: Record<string, unknown>, keys: string[]) => {
      const normalizedRow: Record<string, unknown> = {};
      Object.keys(row).forEach((k) => {
        normalizedRow[normalizeKey(k)] = row[k];
      });
      for (const k of keys) {
        const v = normalizedRow[normalizeKey(k)];
        if (v === undefined || v === null) continue;
        const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
        if (s.trim().length > 0) return s.trim();
      }
      return '';
    };

    wb.SheetNames.forEach((sheetName) => {
      if (!isClientCode(sheetName)) return;
      const ws = wb.Sheets[sheetName];
      if (!ws) return;
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
      const clientCode = getClientCode(sheetName);
      rows.forEach((row) => {
        const id = getCell(row, ['Numéro de pièce', 'Numero de piece', 'Piece', 'ID', 'Numero']);
        const date = getCell(row, ['Date', 'DATE']);
        const libelle = getCell(row, ['Libellé', 'Libelle', 'LIBELLE']);
        const credit = getCell(row, ['Crédit', 'Credit', 'CREDIT']);
        if (!id && !date && !credit && !libelle) return;
        imported.push({
          client: clientCode,
          id,
          date,
          fournisseur: '',
          montant: credit ? credit.replace(/\s/g, '').replace(',', '.') : '',
          libelle,
        });
      });
    });

    if (imported.length === 0) return;

    setProcessedInvoices((prev) => {
      const byId = new Map<string, InvoiceData>();
      prev.forEach((inv) => {
        const key = inv.id && inv.id.trim().length > 0 ? inv.id.trim() : `${getClientCode(inv.client)}|${inv.date}|${inv.montant}|${inv.libelle}`;
        byId.set(key, inv);
      });
      imported.forEach((inv) => {
        const key = inv.id && inv.id.trim().length > 0 ? inv.id.trim() : `${getClientCode(inv.client)}|${inv.date}|${inv.montant}|${inv.libelle}`;
        if (!byId.has(key)) byId.set(key, inv);
      });
      return Array.from(byId.values());
    });
  }, [getClientCode, isClientCode]);

  const syncClientsFromExcel = useCallback(async (handle: ExcelFileHandle) => {
    if (!handle.getFile) return;
    const file = await handle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetClients = wb.SheetNames.filter(isClientCode).map(n => getClientCode(n));
    if (sheetClients.length === 0) return;
    setClients(prev => {
      const seen = new Set(prev.map(p => getClientCode(p)).filter(isClientCode));
      sheetClients.forEach(c => seen.add(c));
      seen.add('CLI001');
      return Array.from(seen);
    });
  }, [getClientCode, isClientCode]);

  const pickExcelFile = async () => {
    const openPicker = (window as unknown as { showOpenFilePicker?: (options: unknown) => Promise<ExcelFileHandle[]> }).showOpenFilePicker;
    const savePicker = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<ExcelFileHandle> }).showSaveFilePicker;

    if (openPicker) {
      const handles = await openPicker({
        multiple: false,
        types: [
          {
            description: 'Excel',
            accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
          },
        ],
      });
      const handle = handles[0];
      if (handle?.requestPermission) {
        try {
          await handle.requestPermission({ mode: 'readwrite' });
        } catch {
        }
      }
      setExcelHandle(handle);
      await syncClientsFromExcel(handle);
      await importInvoicesFromExcel(handle);
      return;
    }

    if (savePicker) {
      const handle = await savePicker({
        suggestedName: 'export_factures_par_client.xlsx',
        types: [
          {
            description: 'Excel',
            accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
          },
        ],
      });
      if (handle?.requestPermission) {
        try {
          await handle.requestPermission({ mode: 'readwrite' });
        } catch {
        }
      }
      setExcelHandle(handle);
      await syncClientsFromExcel(handle);
      await importInvoicesFromExcel(handle);
      return;
    }

    alert("Votre navigateur ne supporte pas l'enregistrement automatique. Utilisez Export Excel.");
  };


  // Sauvegarder dans le localStorage à chaque changement
  useEffect(() => {
    localStorage.setItem('armelia_invoices', JSON.stringify(processedInvoices));
  }, [processedInvoices]);

  useEffect(() => {
    localStorage.setItem('armelia_clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    if (!autoSaveRequestedRef.current) return;
    autoSaveRequestedRef.current = false;

    (async () => {
      const wb = buildWorkbook(processedInvoices);
      try {
        if (excelHandle) {
          if (excelHandle.getFile) {
            try {
              await syncClientsFromExcel(excelHandle);
            } catch {
            }
          }
          const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const writable = await excelHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        }
      } catch {
      }
      XLSX.writeFile(wb, "export_factures_par_client.xlsx");
    })();
  }, [buildWorkbook, excelHandle, processedInvoices, syncClientsFromExcel]);

  useEffect(() => {
    // Charger PDF.js côté client
    const loadPdfJs = async () => {
      try {
        await ensurePdfJsLoaded();
      } catch (e) {
        console.error("Erreur chargement PDF.js", e);
      }
    };
    loadPdfJs();
  }, [ensurePdfJsLoaded]);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;

    (async () => {
      try {
        setCameraError(null);
        setCameraReady(false);
        setTorchSupported(false);
        setTorchOn(false);
        if (!window.isSecureContext) {
          setCameraError("La caméra en direct nécessite HTTPS sur mobile. Utilisez l'import (PDF/JPG/PNG) ou la saisie manuelle.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks?.()[0];
        if (track) {
          try {
            const caps = (track.getCapabilities?.() as unknown as { torch?: boolean; focusMode?: string[] } | undefined);
            if (caps?.torch) setTorchSupported(true);
          } catch {
          }
          try {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints);
          } catch {
          }
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          if (!cancelled) setCameraReady(true);
        }
      } catch {
        if (!cancelled) setCameraError("Impossible d'accéder à la caméra. Autorisez l'accès ou utilisez l'import.");
      }
    })();

    return () => {
      cancelled = true;
      setCameraReady(false);
      setTorchSupported(false);
      setTorchOn(false);
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      streamRef.current = null;
    };
  }, [cameraOpen]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
    }
  };

  useEffect(() => {
    if (fileUrl || manualMode || isProcessing) {
      setMobileView('form');
      return;
    }
    setMobileView('scan');
  }, [fileUrl, manualMode, isProcessing]);

  const openCameraOrCapture = () => {
    const canLiveCamera =
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      !!navigator.mediaDevices?.getUserMedia;

    if (canLiveCamera) {
      setCameraOpen(true);
      return;
    }

    cameraFileInputRef.current?.click();
  };

  const startManualEntry = () => {
    const clientCode = getClientCode(client);
    setManualMode(true);
    setFile(null);
    setFileUrl(null);
    setInvoiceData({
      client: clientCode,
      id: getNextPieceId(clientCode, processedInvoices),
      date: '',
      fournisseur: '',
      montant: '',
      libelle: '',
    });
  };

  const deleteClient = useCallback((rawClient: string) => {
    const code = getClientCode(rawClient);
    if (code === 'CLI001') {
      alert('CLI001 ne peut pas être supprimé.');
      return;
    }

    const remainingInvoices = processedInvoices.filter(inv => getClientCode(inv.client) !== code);
    const removedCount = processedInvoices.length - remainingInvoices.length;
    const ok = window.confirm(
      removedCount > 0
        ? `Supprimer le client ${code} et ${removedCount} facture(s) associée(s) ?`
        : `Supprimer le client ${code} ?`
    );
    if (!ok) return;

    setProcessedInvoices(remainingInvoices);
    setClients(prev => {
      const next = prev.map(c => getClientCode(c)).filter(c => c !== code);
      return next.length > 0 ? next : ['CLI001'];
    });
    setFilterClient(prev => (getClientCode(prev) === code ? 'TOUS' : prev));
    setClient(prev => (getClientCode(prev) === code ? 'CLI001' : prev));
    setInvoiceData(prev => {
      if (getClientCode(prev.client) !== code) return prev;
      const fallback = 'CLI001';
      return { ...prev, client: fallback, id: getNextPieceId(fallback, remainingInvoices) };
    });
  }, [getClientCode, getNextPieceId, processedInvoices]);

  const onDrop = (acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setManualMode(false);
      setFile(selectedFile);
      setFileUrl(URL.createObjectURL(selectedFile));
      processFile(selectedFile);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf']
    },
    multiple: false
  });

  const preprocessCanvasForOcrSoft = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
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

  const cloneCanvas = (source: HTMLCanvasElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return canvas;
  };

  const rotateCanvasToDataUrl = (source: HTMLCanvasElement, degrees: 0 | 90 | 180 | 270) => {
    if (degrees === 0) return source.toDataURL('image/png');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return source.toDataURL('image/png');

    const w = source.width;
    const h = source.height;

    if (degrees === 90 || degrees === 270) {
      canvas.width = h;
      canvas.height = w;
    } else {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(source, -w / 2, -h / 2);

    return canvas.toDataURL('image/png');
  };

  const preprocessImageFileToCanvas = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Erreur lecture image"));
        image.src = url;
      });

      const maxWidth = 2000;
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Impossible de créer le contexte canvas");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setProgress(0);
    setOcrRawText('');
    setOcrConfidence(null);
    try {
      let sourceCanvas: HTMLCanvasElement | null = null;

      if (file.type === 'application/pdf') {
        const pdfjs = await ensurePdfJsLoaded();

        const arrayBuffer = await file.arrayBuffer();
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
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1.0 });
        const targetWidth = 1700;
        const scale = Math.min(3, targetWidth / baseViewport.width);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error("Impossible de créer le contexte canvas");

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        sourceCanvas = canvas;
      } else {
        sourceCanvas = await preprocessImageFileToCanvas(file);
      }

      const worker = await Tesseract.createWorker('fra+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      let bestText = '';
      let bestConfidence = -1;

      const portrait = sourceCanvas.height > sourceCanvas.width;
      const angles: Array<0 | 90 | 180 | 270> = portrait ? [0, 180, 90, 270] : [0, 180];

      const recognizeCandidate = async (canvas: HTMLCanvasElement, angle: 0 | 90 | 180 | 270) => {
        const result = await worker.recognize(rotateCanvasToDataUrl(canvas, angle));
        const conf = typeof result?.data?.confidence === 'number' ? result.data.confidence : -1;
        const text = result?.data?.text || '';
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

      setOcrRawText(bestText);
      setOcrConfidence(bestConfidence >= 0 ? Math.round(bestConfidence) : null);

      const extractedData = extractInfoFromText(bestText);
      setInvoiceData({
        client: getClientCode(client),
        id: getNextPieceId(getClientCode(client), processedInvoices),
        ...extractedData
      });
    } catch (error) {
      console.error('OCR Error:', error);
      alert("Erreur lors de l'analyse de la facture. Veuillez remplir les champs manuellement.");
    } finally {
      setIsProcessing(false);
    }
  };

  const captureFromCamera = async () => {
    const stream = streamRef.current;
    const track = stream?.getVideoTracks?.()[0];

    if (track && typeof (window as unknown as { ImageCapture?: unknown }).ImageCapture === 'function') {
      try {
        const ImageCaptureCtor = (window as unknown as { ImageCapture: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture;
        const imageCapture = new ImageCaptureCtor(track);
        const blob = await imageCapture.takePhoto();
        const capturedFile = new File([blob], 'camera.jpg', { type: blob.type || 'image/jpeg' });
        setCameraOpen(false);
        setManualMode(false);
        setFile(capturedFile);
        const url = URL.createObjectURL(capturedFile);
        setFileUrl(url);
        await processFile(capturedFile);
        return;
      } catch {
      }
    }

    const video = videoRef.current;
    if (!video) return;
    const settings = track?.getSettings?.();
    const width = video.videoWidth || settings?.width || 1920;
    const height = video.videoHeight || settings?.height || 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!blob) return;
    const capturedFile = new File([blob], 'camera.jpg', { type: 'image/jpeg' });
    setCameraOpen(false);
    setManualMode(false);
    setFile(capturedFile);
    const url = URL.createObjectURL(capturedFile);
    setFileUrl(url);
    await processFile(capturedFile);
  };

  const extractInfoFromText = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fullText = text.toLowerCase();
    
    // --- EXTRACTION DE LA DATE ---
    // Priorité aux dates précédées de mots clés spécifiques à la facture
    const dateKeywords = /(?:date|factur[ée]|le\s+|du\s+)/i;
    const dateRegex = /(\d{2}[/.-]\d{2}[/.-]\d{4})|(\d{4}[/.-]\d{2}[/.-]\d{2})/;
    const frenchDateRegex = /(\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})/i;
    
    let invoiceDate = '';
    // Chercher une ligne qui contient un mot clé de date ET une date (numérique ou texte)
    const dateLine = lines.find(l => dateKeywords.test(l) && (dateRegex.test(l) || frenchDateRegex.test(l)));
    if (dateLine) {
      const match = dateLine.match(dateRegex) || dateLine.match(frenchDateRegex);
      if (match) invoiceDate = match[0];
    }
    
    // Si pas trouvé, prendre la première date du document
    if (!invoiceDate) {
      const allDates = text.match(new RegExp(dateRegex, 'g')) || text.match(new RegExp(frenchDateRegex, 'g'));
      if (allDates && allDates.length > 0) invoiceDate = allDates[0];
    }

    // --- EXTRACTION DU MONTANT ---
    // Chercher spécifiquement le TOTAL TTC
    const ttcKeywords = /(?:total\s*ttc|net\s*à\s*payer|montant\s*ttc|total\s*eur|total\s*€|payable)/i;
    const amountRegex = /(\d+[\s.,]\d{2})/;
    
    let amount = '';
    // Chercher une ligne avec TTC et un montant
    const ttcLine = lines.find(l => ttcKeywords.test(l) && amountRegex.test(l));
    if (ttcLine) {
      const match = ttcLine.match(amountRegex);
      if (match) amount = match[0];
    }

    if (!amount) {
      // Chercher le montant le plus bas dans le texte qui suit le mot "TOTAL"
      const totalIndex = fullText.lastIndexOf('total');
      if (totalIndex !== -1) {
        const textAfterTotal = text.substring(totalIndex);
        const match = textAfterTotal.match(amountRegex);
        if (match) amount = match[0];
      }
    }

    if (!amount) {
      // En dernier recours, prendre le dernier montant du document (souvent le total)
      const allAmounts = text.match(new RegExp(amountRegex, 'g'));
      if (allAmounts) amount = allAmounts[allAmounts.length - 1];
    }

    // --- EXTRACTION DU FOURNISSEUR ---
    // On ignore les lignes de contact, mentions légales, horaires, etc.
    const noiseKeywords = /(?:question|contact|téléphone|tel|email|mail|site|web|www|http|adresse|siège|social|siret|tva|iban|bic|page|client|destinataire|facturer\s*à|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|horaires|ouverture|fermeture|via|service|consommateurs|bienvenue)/i;
    
    let fournisseur = '';
    // Le fournisseur est souvent dans les premières lignes, et n'est pas une date ni du "bruit"
    const potentialVendors = lines.slice(0, 15).filter(l => 
      l.length > 2 && 
      !dateRegex.test(l) && 
      !frenchDateRegex.test(l) &&
      !l.match(/\d{5}/) && // code postal
      !l.match(/\d{1,2}h\d{2}/) && // horaires type 8h30
      !noiseKeywords.test(l) &&
      !l.match(/facture|invoice|ticket|reçu/i)
    );

    // Si on trouve "LIDL" (cas spécifique fréquent), on le priorise
    const specificVendor = lines.find(l => l.toUpperCase().includes('LIDL'));
    if (specificVendor) {
      fournisseur = 'LIDL';
    } else {
      fournisseur = potentialVendors.length > 0 ? potentialVendors[0] : lines[0] || '';
    }

    const cleanDate = invoiceDate.replace(/\./g, '/');
    const cleanFournisseur = fournisseur.substring(0, 50).trim().toUpperCase();

    return {
      date: cleanDate,
      fournisseur: cleanFournisseur,
      montant: amount.replace(/\s/g, '').replace(',', '.'),
      // Format standard : FACTURE [FOURNISSEUR] DU [DATE]
      libelle: `FACTURE ${cleanFournisseur} DU ${cleanDate}`
    };
  };

  const handleValidate = () => {
    if (!invoiceData.date || !invoiceData.montant || !invoiceData.fournisseur) {
      alert("Veuillez remplir au moins la date, le fournisseur et le montant.");
      return;
    }
    autoSaveRequestedRef.current = true;
    if (excelHandle) {
      void (async () => {
        try {
          await syncClientsFromExcel(excelHandle);
        } catch {
        }
      })();
    }
    const clientCode = getClientCode(invoiceData.client || client);
    setProcessedInvoices(prev => {
      const id = invoiceData.id && invoiceData.id.trim().length > 0 ? invoiceData.id : getNextPieceId(clientCode, prev);
      const normalizedInvoice: InvoiceData = { ...invoiceData, client: clientCode, id };
      const next = [...prev, normalizedInvoice];
      if (manualMode) {
        setInvoiceData({
          client: clientCode,
          id: getNextPieceId(clientCode, next),
          date: '',
          fournisseur: '',
          montant: '',
          libelle: ''
        });
      } else {
        setInvoiceData({
          client: getClientCode(client),
          id: '',
          date: '',
          fournisseur: '',
          montant: '',
          libelle: ''
        });
      }
      return next;
    });
    // Reset
    setFile(null);
    setFileUrl(null);
  };

  const removeInvoice = (index: number) => {
    setProcessedInvoices(prev => prev.filter((_, i) => i !== index));
  };

  const exportToExcel = () => {
    const wb = buildWorkbook(processedInvoices);
    XLSX.writeFile(wb, "export_factures_par_client.xlsx");
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans text-zinc-900">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-2 rounded-lg shadow-md shadow-orange-100">
            <FileText className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-800">Armelia <span className="text-orange-500 font-black">PRO</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right mr-4 hidden md:block">
            <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Factures en attente</p>
            <p className="text-lg font-mono font-bold">{processedInvoices.length}</p>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={pickExcelFile}
              className="border border-zinc-200 bg-white px-4 py-2.5 rounded-full font-bold text-sm hover:border-orange-300 hover:bg-orange-50 transition-all"
              title="Choisir le fichier Excel pour l'enregistrement automatique"
            >
              Lier Excel
            </button>
            {excelHandle?.getFile && (
              <button
                onClick={() => {
                  void (async () => {
                    try {
                      await syncClientsFromExcel(excelHandle);
                    } catch {
                    }
                  })();
                }}
                className="border border-zinc-200 bg-white px-4 py-2.5 rounded-full font-bold text-sm hover:border-orange-300 hover:bg-orange-50 transition-all"
                title="Récupérer les noms de feuilles depuis l'Excel et les ajouter aux filtres"
              >
                Sync Excel
              </button>
            )}
          </div>
          <button 
            onClick={exportToExcel}
            disabled={processedInvoices.length === 0}
            className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-2.5 rounded-full font-semibold hover:bg-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 transition-all active:scale-95 shadow-lg shadow-zinc-200"
          >
            <Download size={18} /> Export Excel
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden h-[calc(100dvh-73px)] md:h-[calc(100vh-73px)]">
        <div className="md:hidden bg-white border-b border-zinc-200 px-4 py-3">
          <div className="bg-zinc-100 p-1 rounded-2xl flex gap-1">
            <button
              type="button"
              onClick={() => setMobileView('scan')}
              className={`flex-1 py-2 rounded-xl font-black text-xs tracking-widest uppercase transition-all ${mobileView === 'scan' ? 'bg-orange-600 text-white shadow' : 'text-zinc-600'}`}
            >
              Scan
            </button>
            <button
              type="button"
              onClick={() => setMobileView('form')}
              className={`flex-1 py-2 rounded-xl font-black text-xs tracking-widest uppercase transition-all ${mobileView === 'form' ? 'bg-orange-600 text-white shadow' : 'text-zinc-600'}`}
            >
              Saisie
            </button>
          </div>
        </div>
        {/* Left Side: Viewer & Dropzone */}
        <div className={`${mobileView === 'scan' ? 'flex' : 'hidden'} md:flex md:flex-1 bg-zinc-100 flex-col p-4 md:p-6 overflow-auto md:overflow-hidden relative`}>
          {!fileUrl ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div 
                {...getRootProps()} 
                className={`w-full max-w-2xl aspect-video border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer group ${isDragActive ? 'border-orange-500 bg-orange-50/50 scale-[1.02]' : 'border-zinc-300 bg-white hover:border-orange-400 hover:shadow-xl'}`}
              >
                <input {...getInputProps()} />
                <div className="bg-orange-600/10 p-6 rounded-full mb-6 group-hover:bg-orange-600/20 transition-colors">
                  <Upload size={48} className="text-orange-600 animate-bounce" />
                </div>
                <h3 className="text-2xl font-black mb-2 tracking-tight">Scanner une facture</h3>
                <p className="text-zinc-500 text-center px-12 leading-relaxed">Glissez votre PDF ou photo ici<br/><span className="text-zinc-400 text-sm font-medium">L&apos;analyse intelligente démarrera instantanément</span></p>
                <div className="flex gap-2 mt-8">
                  {['PDF', 'JPG', 'PNG'].map(ext => (
                    <span key={ext} className="text-[10px] text-zinc-500 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg font-black tracking-widest">{ext}</span>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={startManualEntry}
                  className="bg-white border border-zinc-200 px-5 py-3 rounded-2xl font-black text-sm hover:border-orange-300 hover:bg-orange-50 transition-all"
                >
                  Saisie manuelle
                </button>
                <input
                  ref={cameraFileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={async (e) => {
                    const picked = e.target.files?.[0];
                    e.target.value = '';
                    if (!picked) return;
                    setManualMode(false);
                    setFile(picked);
                    const url = URL.createObjectURL(picked);
                    setFileUrl(url);
                    await processFile(picked);
                  }}
                />
                <button
                  type="button"
                  onClick={openCameraOrCapture}
                  className="bg-white border border-zinc-200 px-5 py-3 rounded-2xl font-black text-sm hover:border-orange-300 hover:bg-orange-50 transition-all flex items-center gap-2"
                >
                  <Camera size={18} /> Caméra
                </button>
                {manualMode && (
                  <span className="text-xs font-black uppercase tracking-widest text-orange-600">Mode manuel actif</span>
                )}
              </div>

              {/* List of already processed invoices */}
              {processedInvoices.length > 0 && (
                <div className="mt-8 w-full max-w-2xl">
                  <div className="flex items-end justify-between gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Factures enregistrées</h4>
                      <p className="text-xs text-zinc-500 font-medium mt-1">{visibleInvoices.length} facture(s)</p>
                    </div>
                    <div className="w-full sm:w-[220px]">
                      <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1">Filtre client</label>
                      <select
                        value={filterClient}
                        onChange={(e) => setFilterClient(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 focus:border-orange-400 outline-none transition-all font-mono text-sm font-bold uppercase tracking-wider"
                      >
                        <option value="TOUS">TOUS</option>
                        {clientOptions.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-3 max-h-[300px] overflow-auto pr-2 custom-scrollbar">
                    {visibleInvoices.map((inv, i) => (
                      <div 
                        key={i} 
                        className="bg-white p-4 rounded-2xl border border-zinc-200 flex justify-between items-center group hover:border-orange-300 hover:shadow-md transition-all animate-slide-in"
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-green-50 p-2.5 rounded-xl text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
                            <Check size={18} strokeWidth={3} />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-zinc-800">{inv.fournisseur}</p>
                            <p className="text-xs text-zinc-500 font-medium">
                              <span className="inline-flex items-center bg-orange-50 text-orange-700 border border-orange-100 px-2 py-0.5 rounded-md font-black text-[10px] tracking-wider mr-2">{inv.client}</span>
                              {inv.date} • <span className="text-orange-600">{inv.id}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-5">
                          <p className="font-mono font-black text-sm bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-100">
                            {parseFloat(inv.montant).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </p>
                          <button 
                            onClick={() => removeInvoice(i)} 
                            className="text-zinc-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"
                            title="Supprimer"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden border border-zinc-200">
              <div className="bg-zinc-50 px-6 py-3 border-b border-zinc-200 flex justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-zinc-500" />
                  <span className="text-sm font-bold truncate max-w-[300px]">{file?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {file?.type === 'application/pdf' && fileUrl && (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-white border border-zinc-200 px-3 py-1.5 rounded-xl font-black text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
                    >
                      Ouvrir
                    </a>
                  )}
                  <button
                    onClick={() => { setFile(null); setFileUrl(null); }}
                    className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-500 transition-colors"
                    title="Fermer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-zinc-800 flex items-center justify-center overflow-auto p-4">
                {file?.type === 'application/pdf' ? (
                  <iframe title="Facture PDF" src={fileUrl} className="w-full h-full rounded shadow-lg" />
                ) : (
                  <img src={fileUrl} alt="Invoice" className="max-w-full max-h-full object-contain shadow-2xl" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Data Form */}
        <div className={`${mobileView === 'form' ? 'flex' : 'hidden'} md:flex w-full md:w-[480px] bg-white border-t md:border-t-0 md:border-l border-zinc-200 flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.02)]`}>
          <div className="p-6 md:p-8 flex-1 overflow-auto">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Extraction</h2>
                <p className="text-zinc-500 text-sm">Vérifiez les données détectées</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-tighter">Référence</p>
                <p className="font-mono text-sm font-bold text-orange-600">{invoiceData.id || `${getClientCode(client)}-XXXX`}</p>
              </div>
            </div>
            
            {isProcessing && (
              <div className="mb-8 p-6 bg-orange-50 rounded-2xl border border-orange-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 text-orange-700">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="font-bold">Analyse intelligente...</span>
                  </div>
                  <span className="text-orange-600 font-mono font-bold text-sm">{progress}%</span>
                </div>
                <div className="w-full bg-orange-200 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-orange-600 h-full transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {!isProcessing && !fileUrl && !manualMode && (
              <div className="h-[400px] flex flex-col items-center justify-center text-center p-8 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
                <div className="bg-white p-4 rounded-2xl shadow-sm mb-4">
                  <AlertCircle size={32} className="text-zinc-300" />
                </div>
                <p className="text-zinc-400 font-medium">Aucun document sélectionné.<br/>Importez une facture pour commencer.</p>
              </div>
            )}

            {(fileUrl || isProcessing || manualMode) && (
              <div className="space-y-6">
                {!isProcessing && ocrRawText && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Texte OCR</p>
                        <p className="text-xs text-zinc-500 font-medium">
                          Confiance: {ocrConfidence === null ? '—' : `${ocrConfidence}%`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowOcrRawText(v => !v)}
                        className="bg-white border border-zinc-200 px-4 py-2 rounded-xl font-black text-xs hover:border-orange-300 hover:bg-orange-50 transition-all"
                      >
                        {showOcrRawText ? 'Masquer' : 'Afficher'}
                      </button>
                    </div>
                    {showOcrRawText && (
                      <textarea
                        value={ocrRawText}
                        readOnly
                        className="mt-3 w-full bg-white border border-zinc-200 rounded-2xl p-3 text-xs font-mono h-[140px]"
                      />
                    )}
                  </div>
                )}
                <div className="group">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1 group-focus-within:text-orange-600 transition-colors">Client</label>
                  <div className="flex gap-2">
                    <select
                      value={getClientCode(invoiceData.client)}
                      onChange={(e) => {
                        const next = getClientCode(e.target.value);
                        setClient(next);
                        setInvoiceData({ ...invoiceData, client: next, id: getNextPieceId(next, processedInvoices) });
                      }}
                      className="flex-1 bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 focus:bg-white focus:border-orange-500 outline-none transition-all font-mono text-lg font-bold uppercase tracking-wider"
                    >
                      {clientOptions.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newClient}
                      onChange={(e) => setNewClient(e.target.value)}
                      className="w-[170px] bg-white border-2 border-zinc-100 rounded-2xl px-4 py-4 focus:border-orange-500 outline-none transition-all font-mono text-sm font-bold uppercase tracking-wider"
                      placeholder="CLI002"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const raw = (newClient || '').trim().toUpperCase();
                        const code = raw.length === 0 ? getNextClientCode(clients) : getClientCode(raw);
                        if (raw.length > 0 && !isClientCode(code)) {
                          alert('Utilisez un code client comme CLI002.');
                          return;
                        }
                        setClients(prev => (prev.includes(code) ? prev : [...prev, code]));
                        setClient(code);
                        setInvoiceData({ ...invoiceData, client: code, id: getNextPieceId(code, processedInvoices) });
                        setNewClient('');
                      }}
                      className="bg-orange-600 text-white px-4 rounded-2xl font-black hover:bg-orange-700 transition-all active:scale-[0.98]"
                    >
                      Ajouter
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteClient(getClientCode(invoiceData.client))}
                      disabled={getClientCode(invoiceData.client) === 'CLI001'}
                      className="bg-white border-2 border-zinc-100 px-4 rounded-2xl font-black hover:border-red-300 hover:bg-red-50 transition-all active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-zinc-100"
                      title="Supprimer ce client"
                    >
                      <Trash2 size={18} className="text-red-600" />
                    </button>
                  </div>
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1 group-focus-within:text-orange-600 transition-colors">Date de facture</label>
                  <input 
                    type="text" 
                    value={invoiceData.date}
                    onChange={(e) => setInvoiceData({...invoiceData, date: e.target.value})}
                    className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 focus:bg-white focus:border-orange-500 outline-none transition-all font-medium text-lg"
                    placeholder="JJ/MM/AAAA"
                  />
                </div>

                <div className="group">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1 group-focus-within:text-orange-600 transition-colors">Fournisseur</label>
                  <input 
                    type="text" 
                    value={invoiceData.fournisseur}
                    onChange={(e) => setInvoiceData({...invoiceData, fournisseur: e.target.value})}
                    className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 focus:bg-white focus:border-orange-500 outline-none transition-all font-medium text-lg"
                    placeholder="Nom de l'entreprise"
                  />
                </div>

                <div className="group">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1 group-focus-within:text-orange-600 transition-colors">Montant TTC (Crédit)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={invoiceData.montant}
                      onChange={(e) => setInvoiceData({...invoiceData, montant: e.target.value})}
                      className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl pl-5 pr-12 py-4 focus:bg-white focus:border-orange-500 outline-none transition-all font-mono text-xl font-bold"
                      placeholder="0.00"
                    />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 font-bold text-zinc-400">€</span>
                  </div>
                </div>

                <div className="group">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1 group-focus-within:text-orange-600 transition-colors">Libellé</label>
                  <textarea 
                    value={invoiceData.libelle}
                    onChange={(e) => setInvoiceData({...invoiceData, libelle: e.target.value})}
                    className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-5 py-4 focus:bg-white focus:border-orange-500 outline-none transition-all font-medium min-h-[100px] resize-none"
                    placeholder="Description pour la comptabilité..."
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-8 bg-zinc-50/50 border-t border-zinc-100">
            <button 
              onClick={handleValidate}
              disabled={isProcessing || (!fileUrl && !manualMode)}
              className="w-full bg-orange-600 text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-all active:scale-[0.98] shadow-xl shadow-orange-100"
            >
              <Check size={24} strokeWidth={3} /> VALIDER ET ENREGISTRER
            </button>
            <p className="text-center text-[10px] text-zinc-400 mt-4 font-bold uppercase tracking-tighter">L&apos;enregistrement sera ajouté à la liste d&apos;export</p>
          </div>
        </div>
      </main>
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-zinc-200">
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500 text-white p-2 rounded-xl">
                  <Camera size={18} />
                </div>
                <div>
                  <p className="font-black">Caméra</p>
                  <p className="text-xs text-zinc-500 font-medium">Prenez une photo de la facture</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCameraOpen(false)}
                className="p-2 rounded-xl hover:bg-zinc-100 transition-colors text-zinc-500"
                title="Fermer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-black">
              <video ref={videoRef} playsInline className="w-full h-[420px] object-contain" />
            </div>

            <div className="px-6 py-4 bg-white border-t border-zinc-200 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-zinc-600">
                {cameraError ? cameraError : cameraReady ? 'Caméra prête' : 'Chargement caméra...'}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCameraOpen(false)}
                  className="bg-white border border-zinc-200 px-5 py-3 rounded-2xl font-black text-sm hover:border-orange-300 hover:bg-orange-50 transition-all"
                >
                  Annuler
                </button>
                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`border border-zinc-200 px-5 py-3 rounded-2xl font-black text-sm transition-all ${torchOn ? 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700' : 'bg-white hover:border-orange-300 hover:bg-orange-50'}`}
                  >
                    Lampe {torchOn ? 'ON' : 'OFF'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={captureFromCamera}
                  disabled={!cameraReady || !!cameraError}
                  className="bg-orange-600 text-white px-5 py-3 rounded-2xl font-black text-sm hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-all"
                >
                  Capturer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
