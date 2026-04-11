import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileArchive, Loader, CheckCircle, XCircle } from "lucide-react";
import { uploadEventZip, getEventStatus, getEventResults } from "../api";

const POLL_INTERVAL_MS = 2000;

export default function UploadZip({ onResults, participantCount, cohortId }) {
  const [eventName, setEventName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  const onDrop = useCallback(async (files) => {
    const file = files[0];
    if (!file) return;
    if (!file.name.endsWith(".zip")) {
      setError("Please upload a .zip file.");
      return;
    }

    setError("");
    setUploading(true);
    setUploadProgress(0);
    setStatus(null);

    try {
      const { event_id } = await uploadEventZip(
        file,
        eventName || file.name.replace(".zip", ""),
        cohortId,
        (e) => setUploadProgress(Math.round((e.loaded / e.total) * 100))
      );

      setUploading(false);

      const poll = async () => {
        try {
          const s = await getEventStatus(event_id);
          setStatus(s);
          if (s.status === "done") {
            const results = await getEventResults(event_id);
            onResults?.(results);
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
      setError(err.response?.data?.detail || "Upload failed. Try again.");
    }
  }, [eventName, cohortId, onResults]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"] },
    multiple: false,
    disabled: uploading || status?.status === "processing",
  });

  const isProcessing = uploading || status?.status === "processing" || status?.status === "pending";
  const isDone    = status?.status === "done";
  const isError   = status?.status === "error";

  const progressPct = status
    ? status.total_photos > 0
      ? Math.round((status.processed_photos / status.total_photos) * 100)
      : 0
    : uploadProgress;

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-x-muted mb-1.5 uppercase tracking-wider">
          Event Name <span className="text-x-faint normal-case font-normal">(optional)</span>
        </label>
        <input
          value={eventName}
          onChange={e => setEventName(e.target.value)}
          placeholder="e.g. Sesión 1 — Liderazgo"
          className="w-full bg-x-surface2 border border-x-border rounded-xl px-4 py-2.5 text-sm text-x-text placeholder:text-x-faint outline-none focus:border-lime transition-colors"
          disabled={isProcessing}
        />
      </div>

      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
          ${isDragActive ? "border-lime bg-lime/5" : "border-x-border hover:border-x-border2 hover:bg-x-surface2/40"}
          ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <FileArchive size={40} className={isDragActive ? "text-lime" : "text-x-faint"} />
          {isDragActive ? (
            <p className="text-lime font-semibold">Drop the ZIP here</p>
          ) : (
            <>
              <p className="font-semibold text-x-text">Drag & drop your ZIP of event photos</p>
              <p className="text-sm text-x-muted">or click to browse</p>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-950/40 border border-red-900/50 rounded-xl p-3 text-sm">
          <XCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {(isProcessing || isDone || isError) && (
        <div className={`rounded-xl border p-5 ${
          isDone  ? "border-lime/30 bg-lime/5" :
          isError ? "border-red-900/60 bg-red-950/30" :
                    "border-x-border bg-x-surface2"
        }`}>
          <div className="flex items-center gap-3">
            {isProcessing && <Loader    size={18} className="animate-spin text-lime shrink-0" />}
            {isDone        && <CheckCircle size={18} className="text-lime shrink-0" />}
            {isError       && <XCircle    size={18} className="text-red-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${
                isDone ? "text-lime" : isError ? "text-red-400" : "text-x-text"
              }`}>
                {isProcessing && (uploading ? `Uploading... ${uploadProgress}%` : "Processing photos...")}
                {isDone  && "Face matching complete!"}
                {isError && "Processing failed"}
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
