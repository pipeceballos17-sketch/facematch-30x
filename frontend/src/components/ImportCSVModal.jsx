import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import {
  X, FileSpreadsheet, Download, Loader, CheckCircle,
  AlertCircle, Link2, User
} from "lucide-react";
import { importParticipantsCSV, getCSVImportStatus, csvTemplateUrl } from "../api";

const POLL_MS = 2000;

const STATUS_CONFIG = {
  pending:     { icon: Loader,      color: "text-x-faint",    spin: true,  label: "Waiting..." },
  searching:   { icon: Link2,       color: "text-lime",        spin: false, label: "Searching LinkedIn..." },
  downloading: { icon: Loader,      color: "text-lime",        spin: true,  label: "Downloading photo..." },
  done:        { icon: CheckCircle, color: "text-lime",        spin: false, label: "Photo ready" },
  needs_photo: { icon: AlertCircle, color: "text-yellow-400",  spin: false, label: "Upload manually" },
  failed:      { icon: AlertCircle, color: "text-red-400",     spin: false, label: "Failed" },
};

export default function ImportCSVModal({ onClose, onImportDone }) {
  const [step, setStep] = useState("upload");
  const [importId, setImportId] = useState(null);
  const [jobData, setJobData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  // ── Poll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!importId) return;
    const poll = async () => {
      try {
        const data = await getCSVImportStatus(importId);
        setJobData(data);
        if (!data.finished) {
          pollRef.current = setTimeout(poll, POLL_MS);
        } else {
          onImportDone?.();
        }
      } catch {
        pollRef.current = setTimeout(poll, POLL_MS);
      }
    };
    poll();
    return () => clearTimeout(pollRef.current);
  }, [importId]);

  // ── Drop ──────────────────────────────────────────────────────────
  const onDrop = useCallback(async (files) => {
    const file = files[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const result = await importParticipantsCSV(file);
      setImportId(result.import_id);
      setStep("progress");
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed. Check the file format.");
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"], "application/vnd.ms-excel": [".csv"] },
    multiple: false,
    disabled: uploading,
  });

  const rows = jobData?.rows || [];
  const doneCount       = rows.filter(r => r.status === "done").length;
  const needsPhotoCount = rows.filter(r => r.status === "needs_photo").length;
  const pct = rows.length > 0 ? Math.round((jobData.completed / rows.length) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-x-surface border border-x-border rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-x-border shrink-0">
          <div>
            <h2 className="font-bold text-x-text text-lg">Import from CSV</h2>
            <p className="text-xs text-x-muted mt-0.5">
              Upload a list — we'll search LinkedIn and fetch photos automatically
            </p>
          </div>
          <button onClick={onClose} className="text-x-faint hover:text-x-muted transition-colors p-1 ml-4">
            <X size={18} />
          </button>
        </div>

        {/* ── Upload step ── */}
        {step === "upload" && (
          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Template */}
            <a
              href={csvTemplateUrl()}
              download="participants_template.csv"
              className="inline-flex items-center gap-2 text-sm text-lime font-semibold hover:text-lime-dim transition-colors"
            >
              <Download size={14} />
              Download CSV template
            </a>

            {/* Format */}
            <div className="border border-x-border rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-x-muted uppercase tracking-wider mb-2">CSV format</p>
              <div className="font-mono bg-x-bg border border-x-border rounded-lg p-3 text-xs overflow-x-auto">
                <div className="text-x-faint">name,company,linkedin_url</div>
                <div className="text-x-text mt-1">María García,30X,</div>
                <div className="text-x-text">John Smith,Acme,https://linkedin.com/in/john</div>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-x-muted">
                <li><span className="text-lime">name</span> — required</li>
                <li><span className="text-lime">company</span> — optional, improves LinkedIn search</li>
                <li><span className="text-lime">linkedin_url</span> — optional, skips search if provided</li>
              </ul>
            </div>

            {/* Drop zone */}
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
                ${isDragActive ? "border-lime bg-lime/5" : "border-x-border hover:border-x-border2 hover:bg-x-surface2/50"}
                ${uploading ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-2">
                {uploading
                  ? <Loader size={32} className="animate-spin text-lime" />
                  : <FileSpreadsheet size={32} className={isDragActive ? "text-lime" : "text-x-faint"} />
                }
                {uploading
                  ? <p className="text-sm text-lime font-semibold">Uploading...</p>
                  : isDragActive
                    ? <p className="font-semibold text-lime">Drop CSV here</p>
                    : <>
                        <p className="font-semibold text-x-text text-sm">Drag & drop your CSV</p>
                        <p className="text-xs text-x-muted">or click to browse</p>
                      </>
                }
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-950/40 border border-red-900/50 rounded-xl p-3 text-sm">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── Progress step ── */}
        {step === "progress" && jobData && (
          <>
            {/* Summary */}
            <div className="p-6 border-b border-x-border shrink-0 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className={`font-semibold ${jobData.finished ? "text-lime" : "text-x-text"}`}>
                  {jobData.finished ? "Import complete" : `Processing ${rows.length} participants...`}
                </span>
                <span className="text-x-muted text-xs">{jobData.completed}/{rows.length}</span>
              </div>
              <div className="h-1.5 bg-x-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-lime rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {jobData.finished && (
                <div className="flex gap-5 text-xs">
                  <span className="flex items-center gap-1.5 text-lime">
                    <CheckCircle size={12} /> {doneCount} photos ready
                  </span>
                  {needsPhotoCount > 0 && (
                    <span className="flex items-center gap-1.5 text-yellow-400">
                      <AlertCircle size={12} /> {needsPhotoCount} need manual upload
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Per-row list */}
            <div className="overflow-y-auto flex-1 divide-y divide-x-border">
              {rows.map((row) => {
                const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                return (
                  <div key={row.participant_id} className="flex items-center gap-3 px-6 py-3.5">
                    <div className="w-8 h-8 rounded-full bg-x-surface2 border border-x-border flex items-center justify-center shrink-0">
                      <User size={14} className="text-x-faint" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-x-text truncate">{row.name}</p>
                      {row.company && (
                        <p className="text-xs text-x-faint truncate">{row.company}</p>
                      )}
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color} shrink-0`}>
                      <Icon size={13} className={cfg.spin ? "animate-spin" : ""} />
                      <span className="hidden sm:inline">{row.message || cfg.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-x-border shrink-0">
              {jobData.finished ? (
                <button
                  onClick={onClose}
                  className="w-full bg-lime text-x-bg rounded-xl py-2.5 text-sm font-bold hover:bg-lime-dim transition-colors"
                >
                  Done — view participants
                </button>
              ) : (
                <p className="text-xs text-center text-x-faint">
                  You can close this window — the import continues in the background.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
