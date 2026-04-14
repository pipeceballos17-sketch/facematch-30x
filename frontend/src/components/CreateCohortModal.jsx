import { useState } from "react";
import { X, Loader, FolderPlus } from "lucide-react";
import { createCohort } from "../api";

const PROGRAMS = [
  "Inmersivo Ejecutivo",
  "Mentoría Grupal",
  "Bootcamp",
  "Retiro de Liderazgo",
  "Summit 30X",
  "Otro",
];

export default function CreateCohortModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [program, setProgram] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      if (program) fd.append("program", program);
      if (description.trim()) fd.append("description", description.trim());
      const cohort = await createCohort(fd);
      onCreated(cohort);
      onClose();
    } catch {
      // ignorar
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-x-surface border border-x-border rounded-2xl shadow-2xl w-full max-w-md">

        <div className="flex items-center justify-between p-6 border-b border-x-border">
          <h2 className="font-bold text-x-text text-lg">Crear Cohort</h2>
          <button onClick={onClose} className="text-x-faint hover:text-x-muted p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-x-muted mb-1.5 uppercase tracking-wider">
              Nombre del cohort *
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ej. Inmersivo Ejecutivo Abril 2025"
              className="w-full bg-x-surface2 border border-x-border rounded-xl px-4 py-2.5 text-sm text-x-text placeholder:text-x-faint outline-none focus:border-lime transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-x-muted mb-1.5 uppercase tracking-wider">
              Tipo de programa
            </label>
            <select
              value={program}
              onChange={e => setProgram(e.target.value)}
              className="w-full bg-x-surface2 border border-x-border rounded-xl px-4 py-2.5 text-sm text-x-text outline-none focus:border-lime transition-colors appearance-none"
            >
              <option value="">Selecciona un programa...</option>
              {PROGRAMS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-x-muted mb-1.5 uppercase tracking-wider">
              Descripción <span className="text-x-faint normal-case font-normal">(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descripción breve de este cohort..."
              rows={3}
              className="w-full bg-x-surface2 border border-x-border rounded-xl px-4 py-2.5 text-sm text-x-text placeholder:text-x-faint outline-none focus:border-lime transition-colors resize-none"
            />
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
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="flex-1 flex items-center justify-center gap-2 bg-lime text-x-ink rounded-xl py-2.5 text-sm font-bold hover:bg-lime-dim disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader size={14} className="animate-spin" /> : <FolderPlus size={14} />}
            Crear Cohort
          </button>
        </div>
      </div>
    </div>
  );
}
