import { useState } from "react";
import { X, Loader, UserPlus, Link2 } from "lucide-react";
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

  const handleLinkedInSearch = async () => {
    if (!name.trim()) return;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const results = await searchLinkedIn(name.trim(), company.trim() || undefined);
      if (results.length === 0) {
        setSearchError("No LinkedIn profiles found. Add the participant and upload a photo manually.");
      }
      setSearchResults(results);
    } catch {
      setSearchError("LinkedIn search failed. Add the participant manually.");
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
    } catch { /* ignore */ }
    finally { setAdding(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-x-surface border border-x-border rounded-2xl shadow-2xl w-full max-w-md">

        <div className="flex items-center justify-between p-6 border-b border-x-border">
          <h2 className="font-bold text-x-text text-lg">Add Participant</h2>
          <button onClick={onClose} className="text-x-faint hover:text-x-muted p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <Field label="Full Name *">
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLinkedInSearch()}
              placeholder="e.g. María García"
              className={inputCls}
            />
          </Field>

          <Field label="Phone Number">
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+52 55 1234 5678"
              className={inputCls}
            />
          </Field>

          <Field label="Company (optional — improves LinkedIn search)">
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. 30X"
              className={inputCls}
            />
          </Field>

          <button
            onClick={handleLinkedInSearch}
            disabled={!name.trim() || searching}
            className="w-full flex items-center justify-center gap-2 border border-x-border text-x-muted rounded-xl py-2.5 text-sm hover:text-x-text hover:border-x-border2 disabled:opacity-40 transition-colors"
          >
            {searching ? <Loader size={14} className="animate-spin" /> : <Link2 size={14} />}
            Search LinkedIn for profile picture
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
                  onClick={() => { setLinkedinUrl(r.linkedin_url); setSearchResults([]); }}
                  className="w-full text-left px-4 py-3 hover:bg-x-surface2 transition-colors"
                >
                  <p className="text-sm font-medium text-x-text">{r.name}</p>
                  {r.headline && <p className="text-xs text-x-muted truncate mt-0.5">{r.headline}</p>}
                  <p className="text-xs text-lime/70 truncate mt-0.5">{r.linkedin_url}</p>
                </button>
              ))}
            </div>
          )}

          {linkedinUrl && (
            <Field label="LinkedIn URL">
              <input
                value={linkedinUrl}
                onChange={e => setLinkedinUrl(e.target.value)}
                className="w-full bg-x-surface2 border border-x-border rounded-xl px-4 py-2 text-xs text-lime/80 outline-none focus:border-lime transition-colors"
              />
            </Field>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-x-border">
          <button
            onClick={onClose}
            className="flex-1 border border-x-border rounded-xl py-2.5 text-sm text-x-muted hover:text-x-text hover:border-x-border2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || adding}
            className="flex-1 flex items-center justify-center gap-2 bg-lime text-x-bg rounded-xl py-2.5 text-sm font-bold hover:bg-lime-dim disabled:opacity-40 transition-colors"
          >
            {adding ? <Loader size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Add Participant
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
