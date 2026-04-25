import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, Upload, CheckCircle, Loader,
  Image as ImageIcon, Trash2, Share2, Copy, X,
} from "lucide-react";
import {
  listCohortPhotos,
  uploadCohortPhotos,
  deleteCohortPhoto,
  getCohortPhotoUrl,
} from "../api";

const SUPPORTED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
const BATCH_SIZE = 8;            // photos per POST
const MAX_PARALLEL = 3;          // concurrent POSTs

function isImageName(name) {
  const lower = (name || "").toLowerCase();
  return SUPPORTED_EXT.some(ext => lower.endsWith(ext));
}

// Walks a dropped folder/file entry tree and yields every file inside.
// Lets the photographer drag the entire folder onto the dropzone, no ZIP needed.
async function readEntries(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}
async function entryToFiles(entry, out) {
  if (entry.isFile) {
    if (!isImageName(entry.name)) return;
    if (entry.name.startsWith(".")) return; // skip hidden
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push(file);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await readEntries(reader);
      for (const child of batch) await entryToFiles(child, out);
    } while (batch.length);
  }
}
// IMPORTANT: webkitGetAsEntry must be called synchronously inside the drop
// handler — items list is cleared after the event returns. Snapshot first,
// then walk the trees asynchronously.
function snapshotDrop(e) {
  const items = e.dataTransfer?.items;
  const entries = [];
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") continue;
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) entries.push(entry);
    }
  }
  const flatFiles = Array.from(e.dataTransfer?.files || []);
  return { entries, flatFiles };
}

async function expandSnapshot({ entries, flatFiles }) {
  const out = [];
  if (entries.length) {
    for (const e of entries) await entryToFiles(e, out);
  }
  // Always merge flatFiles too — covers browsers without the entry API.
  for (const f of flatFiles) {
    if (isImageName(f.name) && !out.some(o => o.name === f.name && o.size === f.size)) {
      out.push(f);
    }
  }
  return out;
}

function ShareModal({ onClose, cohort }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${window.location.pathname}#portal/${cohort.id}`;
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-x-surface border border-x-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-x-border">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-lime" />
            <h2 className="font-bold text-x-text">Compartir portal</h2>
          </div>
          <button onClick={onClose} className="text-x-faint hover:text-x-muted p-1">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-x-muted text-sm leading-relaxed">
            Envía este link directo al cohort <strong className="text-x-text">{cohort.name}</strong>.
            Los participantes suben una selfie y descargan sus fotos.
          </p>
          <div className="flex items-center gap-2 bg-x-bg border border-x-border rounded-xl px-4 py-3">
            <span className="flex-1 text-sm text-lime font-mono truncate">{url}</span>
            <button
              onClick={copy}
              className="flex items-center gap-1.5 shrink-0 bg-lime text-x-ink text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-lime-dim transition-colors"
            >
              {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full border border-x-border rounded-xl py-2.5 text-sm text-x-muted hover:text-x-text hover:border-x-border2 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CohortDetail({ cohort, onBack }) {
  const [photos, setPhotos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [deletingPhoto, setDel]   = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [dragOver, setDragOver]   = useState(false);

  // Upload queue state
  const [queueTotal, setQueueTotal]     = useState(0);
  const [queueDone, setQueueDone]       = useState(0);
  const [queueFailed, setQueueFailed]   = useState(0);
  const [queueIndexed, setQueueIndexed] = useState(0);
  const [queueStage, setQueueStage]     = useState(""); // "scanning" | "uploading" | ""
  const [debugInfo, setDebugInfo]       = useState(""); // visible diagnostic line
  const uploading = queueStage !== "";
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    listCohortPhotos(cohort.id)
      .then(d => setPhotos(d.photos || []))
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [cohort.id]);

  const handleDelete = async (filename) => {
    setDel(filename);
    try {
      await deleteCohortPhoto(cohort.id, filename);
      setPhotos(prev => prev.filter(p => p !== filename));
    } catch { /* ignore */ }
    finally { setDel(null); }
  };

  const runUpload = async (files) => {
    if (!files.length) { setQueueStage(""); return; }
    setQueueTotal(files.length);
    setQueueDone(0);
    setQueueFailed(0);
    setQueueIndexed(0);
    setQueueStage("uploading");

    const batches = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      batches.push(files.slice(i, i + BATCH_SIZE));
    }

    let nextBatch = 0;
    const workers = Array.from({ length: Math.min(MAX_PARALLEL, batches.length) }, async () => {
      while (nextBatch < batches.length) {
        const batch = batches[nextBatch++];
        try {
          const r = await uploadCohortPhotos(cohort.id, batch);
          setQueueDone(d => d + (r.saved || 0));
          setQueueFailed(f => f + (r.failed?.length || 0));
          setQueueIndexed(i => i + (r.indexed_faces || 0));
        } catch {
          setQueueFailed(f => f + batch.length);
        }
      }
    });
    await Promise.all(workers);

    setQueueStage("");
    load();
  };

  const handlePicker = (e) => {
    const all = Array.from(e.target.files || []);
    const files = all.filter(f => isImageName(f.name));
    e.target.value = "";
    if (uploading) return;
    setDebugInfo(`PICKER · ${all.length} files seleccionadas · ${files.length} son imágenes`);
    if (!files.length) {
      setDebugInfo(d => `${d} · NADA. Asegúrate de elegir .jpg/.png/.webp`);
      return;
    }
    runUpload(files);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    setDebugInfo("");
    // Snapshot SYNCHRONOUSLY — items list dies after this handler returns.
    const snap = snapshotDrop(e);
    setDebugInfo(
      `DROP recibido · ${snap.entries.length} entries (folder API) · ${snap.flatFiles.length} flat files`
    );
    setQueueStage("scanning");
    try {
      const files = await expandSnapshot(snap);
      setDebugInfo(d => `${d} → ${files.length} fotos detectadas`);
      if (!files.length) {
        setDebugInfo(d =>
          `${d} · NADA. Posibles causas: (1) deploy de Vercel aún no actualiza — Ctrl+Shift+R; (2) arrastraste un .zip — descomprímelo primero; (3) tu navegador no expone el API del folder. Usa el botón "Elegir fotos".`
        );
        return;
      }
      await runUpload(files);
    } catch (err) {
      setDebugInfo(d => `${d} · ERROR: ${err?.message || err}`);
    } finally {
      setQueueStage(s => (s === "scanning" ? "" : s));
    }
  };

  const progress = queueTotal
    ? Math.round(((queueDone + queueFailed) / queueTotal) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <button
          onClick={onBack}
          className="mt-1 p-2 border border-x-border rounded-xl text-x-muted hover:text-x-text hover:border-x-border2 transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          {cohort.program && (
            <span
              className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2"
              style={{
                color: cohort.cover_color || "#ebff6f",
                background: `${cohort.cover_color || "#ebff6f"}18`,
                border: `1px solid ${cohort.cover_color || "#ebff6f"}30`,
              }}
            >
              {cohort.program}
            </span>
          )}
          <h2 className="text-2xl font-bold text-x-text">{cohort.name}</h2>
          {cohort.description && (
            <p className="text-x-muted text-sm mt-1">{cohort.description}</p>
          )}
          <div className="flex gap-6 mt-3">
            <QuickStat label="Fotos"           value={photos.length} />
            <QuickStat label="Caras indexadas" value={cohort.indexed_faces || 0} accent />
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-2 border border-x-border text-x-muted rounded-xl px-4 py-2.5 text-sm font-medium hover:text-x-text hover:border-x-border2 transition-colors"
          >
            <Share2 size={15} />
            Compartir
          </button>
        </div>
      </div>

      {/* Upload zone — always visible */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-8 mb-6 text-center transition-all ${
          dragOver ? "border-lime bg-lime/5" : "border-x-border bg-x-surface"
        } ${uploading ? "opacity-80" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handlePicker}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          // eslint-disable-next-line react/no-unknown-property
          webkitdirectory=""
          directory=""
          multiple
          onChange={handlePicker}
          className="hidden"
        />
        {!uploading ? (
          <>
            <Upload size={28} className="mx-auto mb-3 text-lime" />
            <p className="text-sm font-semibold text-x-text mb-1">
              Arrastra una carpeta o fotos aquí
            </p>
            <p className="text-xs text-x-faint mb-4">
              Se suman a la piscina del cohort. Puedes subir varias veces.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-bold border border-x-border text-x-muted hover:text-x-text hover:border-x-border2 rounded-lg px-4 py-2 transition-colors"
              >
                Elegir fotos
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="text-xs font-bold bg-lime text-x-ink hover:bg-lime-dim rounded-lg px-4 py-2 transition-colors"
              >
                Elegir carpeta
              </button>
            </div>
          </>
        ) : queueStage === "scanning" ? (
          <>
            <Loader size={24} className="mx-auto mb-3 animate-spin text-lime" />
            <p className="text-sm font-semibold text-x-text">Escaneando carpeta…</p>
          </>
        ) : (
          <>
            <Loader size={24} className="mx-auto mb-3 animate-spin text-lime" />
            <p className="text-sm font-semibold text-x-text mb-2">
              {queueDone + queueFailed} de {queueTotal} procesadas
            </p>
            <div className="max-w-md mx-auto h-2 bg-x-bg rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-lime transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-x-faint">
              {queueIndexed} caras indexadas
              {queueFailed > 0 && <span className="text-red-400"> · {queueFailed} fallidas</span>}
            </p>
          </>
        )}
      </div>

      {debugInfo && (
        <div className="mb-6 p-3 rounded-lg bg-x-surface2 border border-x-border text-[11px] font-mono text-x-muted whitespace-pre-wrap break-words">
          {debugInfo}
        </div>
      )}

      {/* Photo pool */}
      <div className="bg-x-surface border border-x-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-x-muted uppercase tracking-wider">
            Piscina de fotos
          </p>
          <p className="text-xs text-x-faint">
            {photos.length} foto{photos.length !== 1 ? "s" : ""}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader size={22} className="animate-spin text-x-faint" />
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-10 text-x-faint">
            <ImageIcon size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Sin fotos todavía</p>
            <p className="text-xs mt-1">Arrastra tu primer batch arriba.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {photos.map(filename => (
              <div key={filename} className="relative group">
                <a href={getCohortPhotoUrl(cohort.id, filename)} target="_blank" rel="noreferrer">
                  <img
                    src={`${getCohortPhotoUrl(cohort.id, filename)}?thumb=1`}
                    alt={filename}
                    className="w-full aspect-square object-cover rounded-lg group-hover:opacity-75 transition-opacity"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
                <button
                  onClick={() => handleDelete(filename)}
                  disabled={deletingPhoto === filename}
                  className="absolute top-1 right-1 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 hover:bg-red-700 text-white"
                  title="Eliminar foto"
                >
                  {deletingPhoto === filename
                    ? <Loader size={10} className="animate-spin" />
                    : <Trash2 size={10} />
                  }
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showShare && <ShareModal onClose={() => setShowShare(false)} cohort={cohort} />}
    </div>
  );
}

function QuickStat({ label, value, accent }) {
  return (
    <div>
      <span className={`text-lg font-black ${accent ? "text-lime" : "text-x-text"}`}>{value}</span>
      <span className="text-xs text-x-faint ml-1.5">{label}</span>
    </div>
  );
}
