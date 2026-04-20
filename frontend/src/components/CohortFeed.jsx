import { useState, useEffect } from "react";
import {
  Plus, FolderOpen, Camera, Users, Image, ChevronRight,
  Trash2, Calendar
} from "lucide-react";
import { listCohorts, deleteCohort } from "../api";
import CreateCohortModal from "./CreateCohortModal";

function CohortCard({ cohort, onClick, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await onDelete(cohort.id);
  };

  const date = cohort.created_at
    ? new Date(cohort.created_at).toLocaleDateString("es-MX", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div
      onClick={onClick}
      className="group relative bg-x-surface border border-x-border rounded-2xl overflow-hidden cursor-pointer hover:border-x-border2 transition-all hover:-translate-y-0.5"
    >
      <div
        className="h-1.5 w-full"
        style={{ background: cohort.cover_color || "#ebff6f" }}
      />

      <div className="p-5">
        {cohort.program && (
          <span
            className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-3"
            style={{
              color: cohort.cover_color || "#ebff6f",
              background: `${cohort.cover_color || "#ebff6f"}18`,
              border: `1px solid ${cohort.cover_color || "#ebff6f"}30`,
            }}
          >
            {cohort.program}
          </span>
        )}

        <h3 className="font-bold text-x-text text-base leading-snug mb-1">{cohort.name}</h3>

        {cohort.description && (
          <p className="text-xs text-x-muted line-clamp-2 mb-4">{cohort.description}</p>
        )}

        <div className="flex gap-4 mt-4">
          <Stat icon={Camera}  value={cohort.event_count}          label="eventos" />
          <Stat icon={Image}   value={cohort.matched_photos}       label="fotos" />
          <Stat icon={Users}   value={cohort.matched_participants} label="caras" />
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-x-border">
          <div className="flex items-center gap-1.5 text-x-faint text-xs">
            <Calendar size={11} />
            {date}
          </div>
          <ChevronRight size={16} className="text-x-faint group-hover:text-lime transition-colors" />
        </div>
      </div>

      <button
        onClick={handleDelete}
        onMouseLeave={() => setConfirmDelete(false)}
        className={`absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-xs
          ${confirmDelete
            ? "bg-red-900/60 border border-red-700 text-red-300"
            : "bg-x-surface2 border border-x-border text-x-faint hover:text-red-400"
          }`}
        title={confirmDelete ? "Clic para confirmar" : "Eliminar cohort"}
      >
        {confirmDelete ? <span className="px-1 font-semibold">¿Seguro?</span> : <Trash2 size={11} />}
      </button>
    </div>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex flex-col items-start">
      <span className="font-bold text-x-text text-sm">{value}</span>
      <span className="text-x-faint text-[10px] flex items-center gap-1">
        <Icon size={9} />
        {label}
      </span>
    </div>
  );
}

export default function CohortFeed({ onSelectCohort }) {
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listCohorts();
      setCohorts(data);
    } catch { /* backend no disponible */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    await deleteCohort(id);
    setCohorts(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-x-text">Cohorts</h2>
          <p className="text-x-muted text-sm mt-1">
            Organiza tus eventos por programa o edición
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-lime text-x-ink rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-lime-dim transition-colors"
        >
          <Plus size={16} />
          Nuevo Cohort
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-x-surface border border-x-border rounded-2xl h-52 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && cohorts.length === 0 && (
        <div className="text-center py-28">
          <div className="w-20 h-20 rounded-3xl bg-x-surface2 border border-x-border flex items-center justify-center mx-auto mb-6">
            <FolderOpen size={36} className="text-x-faint" />
          </div>
          <p className="font-bold text-x-text text-xl">Sin cohorts todavía</p>
          <p className="text-x-muted text-sm mt-2 max-w-sm mx-auto">
            Crea un cohort por programa o edición para mantener tus eventos organizados.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-6 inline-flex items-center gap-2 bg-lime text-x-ink rounded-xl px-6 py-3 text-sm font-bold hover:bg-lime-dim transition-colors"
          >
            <Plus size={16} />
            Crea tu primer cohort
          </button>
        </div>
      )}

      {!loading && cohorts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cohorts.map(c => (
            <CohortCard
              key={c.id}
              cohort={c}
              onClick={() => onSelectCohort(c)}
              onDelete={handleDelete}
            />
          ))}

          <button
            onClick={() => setShowCreate(true)}
            className="border-2 border-dashed border-x-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-x-faint hover:border-lime/40 hover:text-lime transition-colors min-h-[200px]"
          >
            <Plus size={28} />
            <span className="text-sm font-medium">Nuevo Cohort</span>
          </button>
        </div>
      )}

      {showCreate && (
        <CreateCohortModal
          onClose={() => setShowCreate(false)}
          onCreated={(c) => { setCohorts(prev => [c, ...prev]); setShowCreate(false); }}
        />
      )}
    </div>
  );
}
