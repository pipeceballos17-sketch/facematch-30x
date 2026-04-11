import { useState, useEffect } from "react";
import { FolderOpen, Users, Plus, RefreshCw, AlertTriangle, FileSpreadsheet } from "lucide-react";
import CohortFeed from "./components/CohortFeed";
import CohortDetail from "./components/CohortDetail";
import ParticipantCard from "./components/ParticipantCard";
import AddParticipantModal from "./components/AddParticipantModal";
import ImportCSVModal from "./components/ImportCSVModal";
import { getParticipants, deleteParticipant } from "./api";
import "./index.css";

const LOGO_URL = "https://res.cloudinary.com/do4mzgggm/image/upload/v1772313638/image_74_zxymrr.png";

const TABS = [
  { id: "cohorts",      label: "Cohorts",      icon: FolderOpen },
  { id: "participants", label: "Participants",  icon: Users },
];

export default function App() {
  const [tab, setTab] = useState("cohorts");

  // Cohort navigation
  const [selectedCohort, setSelectedCohort] = useState(null);

  // Participants
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);

  const loadParticipants = async () => {
    setLoading(true);
    try { setParticipants(await getParticipants()); }
    catch { /* backend not ready */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadParticipants(); }, []);

  const handleDelete = async (id) => {
    await deleteParticipant(id);
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const participantsWithPhoto = participants.filter(p => p.has_reference_photo);

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

            {/* Logo — clicking always goes to cohort feed */}
            <button
              onClick={() => { setTab("cohorts"); setSelectedCohort(null); }}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <img src={LOGO_URL} alt="30X" className="h-8 w-auto" />
              <div className="h-5 w-px bg-x-border" />
              <span className="text-x-muted text-sm font-medium tracking-wide">Facematch</span>
            </button>

            {/* Tabs */}
            <nav className="flex gap-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); if (id === "cohorts") setSelectedCohort(null); }}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${tab === id
                      ? "bg-lime text-x-bg font-semibold"
                      : "text-x-muted hover:text-x-text hover:bg-x-surface2"
                    }
                  `}
                >
                  <Icon size={14} />
                  {label}
                  {id === "participants" && participants.length > 0 && (
                    <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                      tab === id ? "bg-x-bg/20 text-x-bg" : "bg-x-surface2 text-x-muted"
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

        {/* ─ Cohorts ─ */}
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

        {/* ─ Participants ─ */}
        {tab === "participants" && (
          <div>
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-x-text">Participants</h2>
                <p className="text-x-muted text-sm mt-1">
                  {participantsWithPhoto.length} of {participants.length} have reference photos
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
                  Import CSV
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 bg-lime text-x-bg rounded-xl px-4 py-2 text-sm font-bold hover:bg-lime-dim transition-colors lime-glow-sm"
                >
                  <Plus size={16} />
                  Add Participant
                </button>
              </div>
            </div>

            {participants.length > 0 && participantsWithPhoto.length < participants.length && (
              <div className="flex items-center gap-3 border border-yellow-900/60 bg-yellow-950/30 rounded-xl p-4 mb-6 text-sm text-yellow-400">
                <AlertTriangle size={16} className="shrink-0" />
                {participants.length - participantsWithPhoto.length} participant(s) have no reference photo.
              </div>
            )}

            {participants.length === 0 && !loading && (
              <div className="text-center py-24">
                <div className="w-16 h-16 rounded-2xl bg-x-surface2 border border-x-border flex items-center justify-center mx-auto mb-5">
                  <Users size={28} className="text-x-faint" />
                </div>
                <p className="font-bold text-x-text text-lg">No participants yet</p>
                <p className="text-x-muted text-sm mt-2 max-w-xs mx-auto">
                  Add participants with their photo before uploading event photos.
                </p>
                <div className="mt-6 flex gap-3 justify-center">
                  <button
                    onClick={() => setShowCSVModal(true)}
                    className="inline-flex items-center gap-2 border border-x-border text-x-muted rounded-xl px-5 py-2.5 text-sm font-medium hover:text-x-text hover:border-x-border2 transition-colors"
                  >
                    <FileSpreadsheet size={16} />
                    Import CSV
                  </button>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-2 bg-lime text-x-bg rounded-xl px-5 py-2.5 text-sm font-bold hover:bg-lime-dim transition-colors lime-glow-sm"
                  >
                    <Plus size={16} />
                    Add one by one
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
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {participants.map(p => (
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
