import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileArchive, Images, Loader, CheckCircle, XCircle } from "lucide-react";
import { uploadEventFiles, getEventStatus } from "../api";

const POLL_INTERVAL_MS = 2000;

const IMAGE_TYPES = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"], "image/bmp": [".bmp"] };
const ZIP_TYPES   = { "application/zip": [".zip"] };

export default function UploadZip({ onResults, cohortId }) {
  const [eventName, setEventName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("zip"); // "zip" | "photos"

  const handleUpload = useCallback(async (droppedFiles) => {
    if (!droppedFiles.length) return;

    const isZip = droppedFiles.length === 1 && droppedFiles[0].name.toLowerCase().endsWith(".zip");
    const resolvedName = eventName || (isZip ? droppedFiles[0].name.replace(".zip", "") : "Evento");

    setError("");
    setUploading(true);
    setUploadProgress(0);
    setStatus(null);

    try {
      const { event_id } = await uploadEventFiles(
        droppedFiles,
        resolvedName,
        cohortId,
        (e) => setUploadProgress(Math.round((e.loaded / e.total) * 100))
      );

      setUploading(false);

      const poll = async () => {
        try {
          const s = await getEventStatus(event_id);
          setStatus(s);
          if (s.status === "done") {
            onResults?.({ event_id, event_name: resolvedName });
            return;
          }
          if (s.status === "error") return;
          setTimeout(poll, POLL_INTERVAL_MS);
        } catch {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      };
      poll();
    } catch (err) {
      setUploading(false);
      setError(err.response?.data?.detail || "Error al subir. Intenta de nuevo.");
    }
  }, [eventName, cohortId, onResults]);

  const { getRootProps: getZipProps, getInputProps: getZipInput, isDragActive: zipDrag } = useDropzone({
    onDrop: handleUpload,
    accept: ZIP_TYPES,
    multiple: false,
    disabled: uploading || status?.status === "processing",
  });

  const { getRootProps: getPhotoProps, getInputProps: getPhotoInput, isDragActive: photoDrag } = useDropzone({
    onDrop: handleUpload,
    accept: IMAGE_TYPES,
    multiple: true,
    disabled: uploading || status?.status === "processing",
  });

  const isProcessing = uploading || status?.status === "processing" || status?.status === "pending";
  const isDone  = status?.status === "done";
  const isError = status?.status === "error";

  const progressPct = status
    ? status.total_photos > 0
      ? Math.round((status.processed_photos / status.total_photos) * 100)
      : 0
    : uploadProgress;

  return (
    <div className="space-y-5">
      {/* Nombre del evento */}
      <div>
        <label className="block text-xs font-semibold text-x-muted mb-1.5 uppercase tracking-wider">
          Nombre del evento <span className="text-x-faint normal-case font-normal">(opcional)</span>
        </label>
        <input
          value={eventName}
          onChange={e => setEventName(e.target.value)}
          placeholder="ej. Sesión 1 — Liderazgo"
          className="w-full bg-x-surface2 border border-x-border rounded-xl px-4 py-2.5 text-sm text-x-text placeholder:text-x-faint outline-none focus:border-lime transition-colors"
          disabled={isProcessing}
        />
      </div>

      {/* Selector de modo */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("zip")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium border transition-colors
            ${mode === "zip"
              ? "bg-lime/10 border-lime/40 text-lime"
              : "border-x-border text-x-muted hover:border-x-border2"
            }`}
        >
          <FileArchive size={14} /> ZIP
        </button>
        <button
          onClick={() => setMode("photos")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium border transition-colors
            ${mode === "photos"
              ? "bg-lime/10 border-lime/40 text-lime"
              : "border-x-border text-x-muted hover:border-x-border2"
            }`}
        >
          <Images size={14} /> Fotos sueltas
        </button>
      </div>

      {/* Dropzone ZIP */}
      {mode === "zip" && (
        <div
          {...getZipProps()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer
            ${zipDrag ? "border-lime bg-lime/5" : "border-x-border hover:border-x-border2 hover:bg-x-surface2/40"}
            ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input {...getZipInput()} />
          <div className="flex flex-col items-center gap-3">
            <FileArchive size={36} className={zipDrag ? "text-lime" : "text-x-faint"} />
            {zipDrag ? (
              <p className="text-lime font-semibold">Suelta el ZIP aquí</p>
            ) : (
              <>
                <p className="font-semibold text-x-text">Arrastra tu ZIP de fotos</p>
                <p className="text-sm text-x-muted">o haz clic para buscar</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dropzone fotos sueltas */}
      {mode === "photos" && (
        <div
          {...getPhotoProps()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer
            ${photoDrag ? "border-lime bg-lime/5" : "border-x-border hover:border-x-border2 hover:bg-x-surface2/40"}
            ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input {...getPhotoInput()} />
          <div className="flex flex-col items-center gap-3">
            <Images size={36} className={photoDrag ? "text-lime" : "text-x-faint"} />
            {photoDrag ? (
              <p className="text-lime font-semibold">Suelta las fotos aquí</p>
            ) : (
              <>
                <p className="font-semibold text-x-text">Arrastra las fotos del evento</p>
                <p className="text-sm text-x-muted">JPG, PNG, WEBP · puedes seleccionar varias</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-950/40 border border-red-900/50 rounded-xl p-3 text-sm">
          <XCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Estado */}
      {(isProcessing || isDone || isError) && (
        <div className={`rounded-xl border p-5 ${
          isDone  ? "border-lime/30 bg-lime/5" :
          isError ? "border-red-900/60 bg-red-950/30" :
                    "border-x-border bg-x-surface2"
        }`}>
          <div className="flex items-center gap-3">
            {isProcessing && <Loader      size={18} className="animate-spin text-lime shrink-0" />}
            {isDone        && <CheckCircle size={18} className="text-lime shrink-0" />}
            {isError       && <XCircle    size={18} className="text-red-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${
                isDone ? "text-lime" : isError ? "text-red-400" : "text-x-text"
              }`}>
                {isProcessing && (uploading ? `Subiendo... ${uploadProgress}%` : "Procesando fotos...")}
                {isDone  && "¡Reconocimiento facial completo!"}
                {isError && "Error en el procesamiento"}
              </p>
              {status?.message && (
                <p className="text-xs text-x-muted mt-0.5 truncate">{status.message}</p>
              )}
            </div>
          </div>
          {isProcessing && (
            <div className="mt-4 h-1.5 bg-x-border rounded-full overflow-hidden">
              <div
                className="h-full bg-lime rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
