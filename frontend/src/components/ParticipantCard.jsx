import { useState } from "react";
import { Link2, Upload, Trash2, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { uploadReferencePhoto, fetchLinkedInPhoto, getParticipantPhotoUrl } from "../api";

// Genera un avatar con iniciales y color derivado del nombre
function InitialsAvatar({ name }) {
  const parts = (name || "?").trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
  const hue = [...(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="w-full h-full flex items-center justify-center text-3xl font-black select-none"
      style={{ background: `hsl(${hue},35%,18%)`, color: `hsl(${hue},60%,65%)` }}
    >
      {initials}
    </div>
  );
}

export default function ParticipantCard({ participant, onDeleted, onPhotoUpdated }) {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [showLinkedinInput, setShowLinkedinInput] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState(participant.linkedin_url || "");
  const [photoKey, setPhotoKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      setErrorMsg("Error al subir la foto.");
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
      setErrorMsg(err.response?.data?.detail || "No se pudo obtener. Sube la foto manualmente.");
    }
  };

  const noPhoto = !participant.has_reference_photo;

  return (
    <div className={`bg-x-surface border rounded-xl overflow-hidden group transition-colors ${
      noPhoto
        ? "border-yellow-800/50 hover:border-yellow-600/50"
        : "border-x-border hover:border-x-border2"
    }`}>
      {/* Foto */}
      <div className="relative h-36 bg-x-surface2 flex items-center justify-center">
        {participant.has_reference_photo ? (
          <img
            key={photoKey}
            src={`${getParticipantPhotoUrl(participant.id)}?t=${photoKey}`}
            alt={participant.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <InitialsAvatar name={participant.name} />
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

        {/* Badge: tiene foto */}
        {participant.has_reference_photo && status === "idle" && (
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-lime" title="Foto de referencia lista" />
        )}

        {/* Badge: sin foto */}
        {noPhoto && status === "idle" && (
          <div className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-900/70 text-yellow-400 border border-yellow-700/50">
            Sin foto
          </div>
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
              className="flex-1 text-xs bg-x-surface2 border border-x-border rounded px-2 py-1 outline-none text-x-text placeholder:text-x-faint focus:border-lime"
              placeholder="linkedin.com/in/nombre"
              value={linkedinUrl}
              onChange={e => setLinkedinUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLinkedInFetch()}
              autoFocus
            />
            <button
              onClick={handleLinkedInFetch}
              disabled={status === "loading" || !linkedinUrl}
              className="text-xs bg-lime text-x-ink px-2 py-1 rounded font-semibold hover:bg-lime-dim disabled:opacity-50"
            >
              Ir
            </button>
          </div>
        )}

        {/* Acciones */}
        <div className="mt-3 flex gap-1.5">
          <button
            onClick={() => setShowLinkedinInput(v => !v)}
            className="flex-1 flex items-center justify-center gap-1 text-xs border border-x-border rounded py-1.5 text-x-muted hover:text-x-text hover:border-x-border2 transition-colors"
            title="Pegar URL de LinkedIn para descargar foto"
          >
            <Link2 size={11} />
            LinkedIn
          </button>

          <label className={`flex-1 flex items-center justify-center gap-1 text-xs border rounded py-1.5 cursor-pointer transition-colors ${
            noPhoto
              ? "border-yellow-700/60 text-yellow-500 hover:bg-yellow-950/30"
              : "border-x-border text-x-muted hover:text-x-text hover:border-x-border2"
          }`}>
            <Upload size={11} />
            Subir foto
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>

          <button
            onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              onDeleted?.(participant.id);
            }}
            onMouseLeave={() => setConfirmDelete(false)}
            className={`flex items-center justify-center p-1.5 border rounded transition-colors ${
              confirmDelete
                ? "bg-red-900/60 border-red-700 text-red-300"
                : "border-x-border text-x-faint hover:text-red-400 hover:border-red-900/60"
            }`}
            title={confirmDelete ? "Clic para confirmar" : "Eliminar participante"}
          >
            {confirmDelete
              ? <span className="text-[9px] font-bold px-0.5">¿OK?</span>
              : <Trash2 size={11} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
