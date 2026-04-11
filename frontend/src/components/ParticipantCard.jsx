import { useState } from "react";
import { User, Link2, Upload, Trash2, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { uploadReferencePhoto, fetchLinkedInPhoto, getParticipantPhotoUrl } from "../api";

export default function ParticipantCard({ participant, onDeleted, onPhotoUpdated }) {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [showLinkedinInput, setShowLinkedinInput] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState(participant.linkedin_url || "");
  const [photoKey, setPhotoKey] = useState(0);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      await uploadReferencePhoto(participant.id, file);
      setPhotoKey(k => k + 1);
      setStatus("success");
      onPhotoUpdated?.();
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setErrorMsg("Upload failed.");
    }
  };

  const handleLinkedInFetch = async () => {
    if (!linkedinUrl) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      await fetchLinkedInPhoto(participant.id, linkedinUrl);
      setPhotoKey(k => k + 1);
      setStatus("success");
      setShowLinkedinInput(false);
      onPhotoUpdated?.();
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.response?.data?.detail || "Could not fetch. Upload manually.");
    }
  };

  return (
    <div className="bg-x-surface border border-x-border rounded-xl overflow-hidden group hover:border-x-border2 transition-colors">
      {/* Photo */}
      <div className="relative h-36 bg-x-surface2 flex items-center justify-center">
        {participant.has_reference_photo ? (
          <img
            key={photoKey}
            src={`${getParticipantPhotoUrl(participant.id)}?t=${photoKey}`}
            alt={participant.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-x-faint">
            <User size={36} />
            <span className="text-xs">No photo</span>
          </div>
        )}

        {/* Status overlays */}
        {status === "loading" && (
          <div className="absolute inset-0 bg-x-bg/70 flex items-center justify-center">
            <Loader size={22} className="animate-spin text-lime" />
          </div>
        )}
        {status === "success" && (
          <div className="absolute inset-0 bg-x-bg/60 flex items-center justify-center">
            <CheckCircle size={26} className="text-lime" />
          </div>
        )}

        {/* Has-photo badge */}
        {participant.has_reference_photo && status === "idle" && (
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-lime" title="Reference photo set" />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-x-text text-sm truncate">{participant.name}</p>
        {participant.company && (
          <p className="text-xs text-x-muted truncate mt-0.5">{participant.company}</p>
        )}

        {errorMsg && (
          <div className="mt-2 flex items-start gap-1 text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded p-1.5">
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* LinkedIn URL input */}
        {showLinkedinInput && (
          <div className="mt-2 flex gap-1">
            <input
              className="flex-1 text-xs bg-x-surface2 border border-x-border rounded px-2 py-1 outline-none text-x-text placeholder:text-x-faint focus:border-lime focus:ring-0"
              placeholder="linkedin.com/in/name"
              value={linkedinUrl}
              onChange={e => setLinkedinUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLinkedInFetch()}
            />
            <button
              onClick={handleLinkedInFetch}
              disabled={status === "loading"}
              className="text-xs bg-lime text-x-bg px-2 py-1 rounded font-semibold hover:bg-lime-dim disabled:opacity-50"
            >
              Get
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-1.5">
          <button
            onClick={() => setShowLinkedinInput(v => !v)}
            className="flex-1 flex items-center justify-center gap-1 text-xs border border-x-border rounded py-1.5 text-x-muted hover:text-x-text hover:border-x-border2 transition-colors"
          >
            <Link2 size={11} />
            LinkedIn
          </button>

          <label className="flex-1 flex items-center justify-center gap-1 text-xs border border-x-border rounded py-1.5 text-x-muted hover:text-x-text hover:border-x-border2 transition-colors cursor-pointer">
            <Upload size={11} />
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>

          <button
            onClick={() => onDeleted?.(participant.id)}
            className="flex items-center justify-center p-1.5 border border-x-border rounded text-x-faint hover:text-red-400 hover:border-red-900/60 transition-colors"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
