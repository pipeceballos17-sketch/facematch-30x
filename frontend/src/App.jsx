import { useState, useEffect } from "react";
import { FolderOpen, Users, Plus, RefreshCw, AlertTriangle, FileSpreadsheet, Search, Lock, Loader } from "lucide-react";
import { api } from "./api";
import CohortFeed from "./components/CohortFeed";
import CohortDetail from "./components/CohortDetail";
import ParticipantCard from "./components/ParticipantCard";
import AddParticipantModal from "./components/AddParticipantModal";
import ImportCSVModal from "./components/ImportCSVModal";
import Portal from "./components/Portal";
import { getParticipants, deleteParticipant } from "./api";
import "./index.css";

const LOGO_URL = "https://res.cloudinary.com/do4mzgggm/image/upload/v1772313638/image_74_zxymrr.png";

function getPortalCohortId() {
  const hash = window.location.hash;
  if (hash === "#portal") return "";               // landing (sin cohort)
  if (hash.startsWith("#portal/")) return hash.slice("#portal/".length);
  return null;                                     // no es portal → admin
}

const TABS = [
  { id: "cohorts",      label: "Cohorts",        icon: FolderOpen },
  { id: "participants", label: "Participantes",   icon: Users },
];

function AdminLock({ onUnlock }) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState(false);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setChecking(true);
    setError(false);
    try {
      await api.get("/api/cohorts", { headers: { "x-admin-key": password } });
      localStorage.setItem("adminKey", password);
      onUnlock();
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-x-bg flex items-center justify-center p-6">
      <div className="bg-x-surface border border-x-border rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <img src={LOGO_URL} alt="30X" className="h-8 mb-6" />
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} className="text-x-faint" />
          <h2 className="font-bold text-x-text text-base">Panel de administración</h2>
        </div>
        <p className="text-x-muted text-sm mb-6">Ingresa la contraseña para continuar.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false); }}
            placeholder="Contraseña"
            className="w-full bg-x-surface2 border border-x-border rounded-xl px-4 py-2.5 text-sm text-x-text placeholder:text-x-faint outline-none focus:border-lime transition-colors"
          />
          {error && <p className="text-red-400 text-xs">Contraseña incorrecta.</p>}
          <button
            type="submit"
            disabled={checking || !password}
            className="w-full flex items-center justify-center gap-2 bg-lime text-x-ink rounded-xl py-2.5 text-sm font-bold hover:bg-lime-dim disabled:opacity-40 transition-colors"
          >
            {checking ? <Loader size={14} className="animate-spin" /> : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [portalCohortId, setPortalCohortId] = useState(getPortalCohortId);
  const [tab, setTab] = useState("cohorts");
  const [selectedCohort, setSelectedCohort] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");

  // Auth state — null means "checking", false = open, true = requires key
  const [authRequired, setAuthRequired] = useState(null);
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem("adminKey") || "");

  useEffect(() => {
    const handleHash = () => setPortalCohortId(getPortalCohortId());
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Listen for 401s dispatched by the axios interceptor
  useEffect(() => {
    const handleLogout = () => setAdminKey("");
    window.addEventListener("admin-logout", handleLogout);
    return () => window.removeEventListener("admin-logout", handleLogout);
  }, []);

  // Check if server requires auth (only in admin mode) — retry up to 5x if backend is starting up
  useEffect(() => {
    if (portalCohortId !== null) return;
    let attempts = 0;
    const check = () => {
      api.get("/api/health")
        .then(r => setAuthRequired(Boolean(r.data.auth_required)))
        .catch(() => {
          attempts++;
          if (attempts < 5) setTimeout(check, 2000);
          else setAuthRequired(false); // give up, open mode
        });
    };
    check();
  }, [portalCohortId]);

  const loadParticipants = async () => {
    setLoading(true);
    try { setParticipants(await getParticipants()); }
    catch { /* backend no disponible */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadParticipants(); }, []);

  if (portalCohortId !== null) return <Portal cohortId={portalCohortId || null} />;

  // Checking auth status — blank screen to avoid flicker
  if (authRequired === null) return <div className="min-h-screen bg-x-bg" />;

  // Lock screen
  if (authRequired && !adminKey) return <AdminLock onUnlock={() => setAdminKey(localStorage.getItem("adminKey") || "")} />;

  const handleDelete = async (id) => {
    await deleteParticipant(id);
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const participantsWithPhoto = participants.filter(p => p.has_reference_photo);
  const filteredParticipants = participantSearch.trim()
    ? participants.filter(p =>
        p.name.toLowerCase().includes(participantSearch.toLowerCase()) ||
        p.company?.toLowerCase().includes(participantSearch.toLowerCase())
      )
    : participants;

  const handleSelectCohort = (cohort) => {
    setSelectedCohort(cohort);
    setTab("cohorts");
  };

  return (
    <div className="min-h-screen bg-x-bg text-x-text">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="bg-x-surface border-b border-x-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">

            <button
              onClick={() => { setTab("cohorts"); setSelectedCohort(null); }}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <img src={LOGO_URL} alt="30X" className="h-8 w-auto" />
              <div className="h-5 w-px bg-x-border" />
              <span className="text-x-muted text-sm font-medium tracking-wide">Facematch</span>
            </button>

            <nav className="flex gap-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); if (id === "cohorts") setSelectedCohort(null); }}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${tab === id
                      ? "bg-lime text-x-ink font-semibold"
                      : "text-x-muted hover:text-x-text hover:bg-x-surface2"
                    }
                  `}
                >
                  <Icon size={14} />
                  {label}
                  {id === "participants" && participants.length > 0 && (
                    <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                      tab === id ? "bg-x-bg/20 text-x-ink" : "bg-x-surface2 text-x-muted"
                    }`}>
                      {participants.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-10">

        {tab === "cohorts" && !selectedCohort && (
          <CohortFeed onSelectCohort={handleSelectCohort} />
        )}

        {tab === "cohorts" && selectedCohort && (
          <CohortDetail
            cohort={selectedCohort}
            onBack={() => setSelectedCohort(null)}
            participantCount={participantsWithPhoto.length}
          />
        )}

        {tab === "participants" && (
          <div>
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-x-text">Participantes</h2>
                <p className="text-x-muted text-sm mt-1">
                  {participantsWithPhoto.length} de {participants.length} tienen foto de referencia
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadParticipants}
                  className="p-2 border border-x-border rounded-xl text-x-muted hover:text-x-text hover:border-x-border2 transition-colors"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={() => setShowCSVModal(true)}
                  className="flex items-center gap-2 border border-x-border text-x-muted rounded-xl px-4 py-2 text-sm font-medium hover:text-x-text hover:border-x-border2 transition-colors"
                >
                  <FileSpreadsheet size={16} />
                  Importar CSV
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 bg-lime text-x-ink rounded-xl px-4 py-2 text-sm font-bold hover:bg-lime-dim transition-colors"
                >
                  <Plus size={16} />
                  Agregar participante
                </button>
              </div>
            </div>

            {participants.length > 0 && (
              <div className="relative mb-5">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-x-faint pointer-events-none" />
                <input
                  value={participantSearch}
                  onChange={e => setParticipantSearch(e.target.value)}
                  placeholder="Buscar por nombre o empresa..."
                  className="w-full bg-x-surface border border-x-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-x-text placeholder:text-x-faint outline-none focus:border-lime transition-colors"
                />
                {participantSearch && (
                  <button
                    onClick={() => setParticipantSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-x-faint hover:text-x-muted"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {participants.length > 0 && participantsWithPhoto.length < participants.length && (
              <div className="flex items-center gap-3 border border-yellow-900/60 bg-yellow-950/30 rounded-xl p-4 mb-6 text-sm text-yellow-400">
                <AlertTriangle size={16} className="shrink-0" />
                {participants.length - participantsWithPhoto.length} participante(s) sin foto de referencia — súbela manualmente en su tarjeta.
              </div>
            )}

            {participants.length === 0 && !loading && (
              <div className="text-center py-24">
                <div className="w-16 h-16 rounded-2xl bg-x-surface2 border border-x-border flex items-center justify-center mx-auto mb-5">
                  <Users size={28} className="text-x-faint" />
                </div>
                <p className="font-bold text-x-text text-lg">Sin participantes</p>
                <p className="text-x-muted text-sm mt-2 max-w-xs mx-auto">
                  Agrega participantes con su foto antes de subir fotos del evento.
                </p>
                <div className="mt-6 flex gap-3 justify-center">
                  <button
                    onClick={() => setShowCSVModal(true)}
                    className="inline-flex items-center gap-2 border border-x-border text-x-muted rounded-xl px-5 py-2.5 text-sm font-medium hover:text-x-text hover:border-x-border2 transition-colors"
                  >
                    <FileSpreadsheet size={16} />
                    Importar CSV
                  </button>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-2 bg-lime text-x-ink rounded-xl px-5 py-2.5 text-sm font-bold hover:bg-lime-dim transition-colors"
                  >
                    <Plus size={16} />
                    Agregar uno por uno
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-x-surface border border-x-border rounded-xl h-56 animate-pulse" />
                ))}
              </div>
            ) : filteredParticipants.length === 0 && participantSearch ? (
              <div className="text-center py-16 text-x-faint">
                <Search size={28} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Sin resultados para "{participantSearch}"</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredParticipants.map(p => (
                  <ParticipantCard
                    key={p.id}
                    participant={p}
                    onDeleted={handleDelete}
                    onPhotoUpdated={loadParticipants}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {showAddModal && (
        <AddParticipantModal
          onClose={() => setShowAddModal(false)}
          onAdded={(p) => { setParticipants(prev => [...prev, p]); setShowAddModal(false); }}
        />
      )}
      {showCSVModal && (
        <ImportCSVModal
          onClose={() => { setShowCSVModal(false); loadParticipants(); }}
          onImportDone={loadParticipants}
        />
      )}
    </div>
  );
}
