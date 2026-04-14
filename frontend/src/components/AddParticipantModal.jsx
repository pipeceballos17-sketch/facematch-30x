import { useState } from "react";
import { X, Loader, UserPlus, Link2, ChevronDown } from "lucide-react";
import { createParticipant, searchLinkedIn } from "../api";

export default function AddParticipantModal({ onClose, onAdded }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [adding, setAdding] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);

  const handleLinkedInSearch = async () => {
    if (!name.trim()) return;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const results = await searchLinkedIn(name.trim(), company.trim() || undefined);
      if (results.length === 0) {
        setSearchError("No se encontraron perfiles. Agrega el participante y sube una foto manualmente.");
      }
      setSearchResults(results);
    } catch {
      setSearchError("Búsqueda fallida. Pega la URL de LinkedIn manualmente o sube una foto.");
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      if (phone.trim())       fd.append("phone", phone.trim());
      if (company.trim())     fd.append("company", company.trim());
      if (linkedinUrl.trim()) fd.append("linkedin_url", linkedinUrl.trim());
      const participant = await createParticipant(fd);
      onAdded(participant);
      onClose();
    } catch { /* ignorar */ }
    finally { setAdding(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-x-surface border border-x-border rounded-2xl shadow-2xl w-full max-w-md">

        <div className="flex items-center justify-between p-6 border-b border-x-border">
          <h2 className="font-bold text-x-text text-lg">Agregar participante</h2>
          <button onClick={onClose} className="text-x-faint hover:text-x-muted p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <Field label="Nombre completo *">
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLinkedInSearch()}
              placeholder="ej. María García"
              className={inputCls}
            />
          </Field>

          <Field label="Teléfono">
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+52 55 1234 5678"
              className={inputCls}
            />
          </Field>

          <Field label="Empresa (opcional — mejora la búsqueda en LinkedIn)">
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="ej. 30X"
              className={inputCls}
            />
          </Field>

          {/* LinkedIn search */}
          <button
            onClick={handleLinkedInSearch}
            disabled={!name.trim() || searching}
            className="w-full flex items-center justify-center gap-2 border border-x-border text-x-muted rounded-xl py-2.5 text-sm hover:text-x-text hover:border-x-border2 disabled:opacity-40 transition-colors"
          >
            {searching ? <Loader size={14} className="animate-spin" /> : <Link2 size={14} />}
            Buscar en LinkedIn
          </button>

          {searchError && (
            <p className="text-xs text-yellow-500 bg-yellow-950/30 border border-yellow-900/50 rounded-xl p-2.5">
              {searchError}
            </p>
          )}

          {searchResults.length > 0 && (
            <div className="border border-x-border rounded-xl divide-y divide-x-border max-h-44 overflow-y-auto bg-x-bg">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => { setLinkedinUrl(r.linkedin_url); setSearchResults([]); setShowManualUrl(true); }}
                  className="w-full text-left px-4 py-3 hover:bg-x-surface2 transition-colors"
                >
                  <p className="text-sm font-medium text-x-text">{r.name}</p>
                  {r.headline && <p className="text-xs text-x-muted truncate mt-0.5">{r.headline}</p>}
                  <p className="text-xs text-lime/70 truncate mt-0.5">{r.linkedin_url}</p>
                </button>
              ))}
            </div>
          )}

          {/* Manual LinkedIn URL — always accessible */}
          <div>
            <button
              onClick={() => setShowManualUrl(v => !v)}
              className="flex items-center gap-1 text-xs text-x-faint hover:text-x-muted transition-colors"
            >
              <ChevronDown size={12} className={`transition-transform ${showManualUrl ? "rotate-180" : ""}`} />
              Pegar URL de LinkedIn manualmente
            </button>

            {showManualUrl && (
              <div className="mt-2">
                <input
                  value={linkedinUrl}
                  onChange={e => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/nombre"
                  className="w-full bg-x-surface2 border border-x-border rounded-xl px-4 py-2 text-xs text-lime/80 outline-none focus:border-lime transition-colors"
                />
                <p className="text-[10px] text-x-faint mt-1">
                  El sistema descargará la foto de perfil automáticamente al agregar.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-x-border">
          <button
            onClick={onClose}
            className="flex-1 border border-x-border rounded-xl py-2.5 text-sm text-x-muted hover:text-x-text hover:border-x-border2 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || adding}
            className="flex-1 flex items-center justify-center gap-2 bg-lime text-x-ink rounded-xl py-2.5 text-sm font-bold hover:bg-lime-dim disabled:opacity-40 transition-colors"
          >
            {adding ? <Loader size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full bg-x-surface2 border border-x-border rounded-xl px-4 py-2.5 text-sm text-x-text placeholder:text-x-faint outline-none focus:border-lime transition-colors";

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-x-muted mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}
