import { useState, useEffect } from "react";
import {
  ArrowLeft, Upload, Camera, CheckCircle, Loader,
  XCircle, ChevronRight, Image, Users, Trash2, Share2, Copy, X,
} from "lucide-react";
import { getCohortEvents, deleteEvent, getEventPhotos, getEventPhotoUrl, deleteEventPhoto, addEventPhotos } from "../api";
import UploadZip from "./UploadZip";

function ShareModal({ onClose, cohort }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${window.location.pathname}#portal/${cohort.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-x-surface border border-x-border rounded-2xl shadow-2xl w-full max-w-md">

        <div className="flex items-center justify-between p-6 border-b border-x-border">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-lime" />
            <h2 className="font-bold text-x-text">Compartir portal con participantes</h2>
          </div>
          <button onClick={onClose} className="text-x-faint hover:text-x-muted p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-x-muted text-sm leading-relaxed">
            Envía este link directo al cohort <strong className="text-x-text">{cohort.name}</strong> por WhatsApp, email o Slack.
            Los participantes suben una selfie y descargan sus fotos automáticamente.
          </p>

          {/* Link box */}
          <div className="flex items-center gap-2 bg-x-bg border border-x-border rounded-xl px-4 py-3">
            <span className="flex-1 text-sm text-lime font-mono truncate">{url}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 shrink-0 bg-lime text-x-ink text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-lime-dim transition-colors"
            >
              {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>

          {/* Instrucciones sugeridas */}
          <div className="bg-x-bg border border-x-border rounded-xl p-4">
            <p className="text-[10px] font-bold text-x-faint uppercase tracking-widest mb-2">
              Mensaje sugerido
            </p>
            <p className="text-xs text-x-muted leading-relaxed">
              "¡Hola! 👋 Ya subimos todas las fotos de tu evento. Entra a este link, selecciona tu cohort, sube una selfie y descarga todas las fotos donde apareces 📸"
            </p>
          </div>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full border border-x-border rounded-xl py-2.5 text-sm text-x-muted hover:text-x-text hover:border-x-border2 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function EventRow({ event, onSelect, isSelected, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusIcon = {
    done:       <CheckCircle size={14} className="text-lime" />,
    processing: <Loader      size={14} className="text-blue-400 animate-spin" />,
    pending:    <Loader      size={14} className="text-x-faint animate-spin" />,
    error:      <XCircle     size={14} className="text-red-400" />,
  }[event.status] || null;

  const date = event.created_at
    ? new Date(event.created_at).toLocaleDateString("es-MX", { month: "short", day: "numeric" })
    : "";

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete(event.event_id);
  };

  return (
    <div className="relative group">
      <button
        onClick={() => onSelect(event)}
        className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl transition-all text-left
          ${isSelected
            ? "bg-lime/10 border border-lime/30"
            : "bg-x-surface2 border border-x-border hover:border-x-border2"
          }`}
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          isSelected ? "bg-lime/20" : "bg-x-bg"
        }`}>
          <Camera size={16} className={isSelected ? "text-lime" : "text-x-faint"} />
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <p className={`text-sm font-semibold truncate ${isSelected ? "text-lime" : "text-x-text"}`}>
            {event.event_name}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-x-faint flex items-center gap-1">
              <Image size={10} /> {event.total_photos} fotos
            </span>
            <span className="text-xs text-x-faint flex items-center gap-1">
              <Users size={10} /> {event.indexed_faces} caras
            </span>
            {date && <span className="text-xs text-x-faint">{date}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {statusIcon}
          <ChevronRight size={14} className={isSelected ? "text-lime" : "text-x-faint"} />
        </div>
      </button>

      {/* Delete button — floats top-right, visible on hover */}
      <button
        onClick={handleDeleteClick}
        onMouseLeave={() => setConfirmDelete(false)}
        className={`absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-all text-[10px]
          ${confirmDelete
            ? "bg-red-900/60 border border-red-700 text-red-300"
            : "bg-x-bg border border-x-border text-x-faint hover:text-red-400"
          }`}
        title={confirmDelete ? "Clic para confirmar" : "Eliminar evento"}
      >
        {confirmDelete ? <span className="px-1 font-semibold">¿Seguro?</span> : <Trash2 size={10} />}
      </button>
    </div>
  );
}

function EventDetail({ event, onShare }) {
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [deletingPhoto, setDeletingPhoto] = useState(null);
  const [addingPhotos, setAddingPhotos] = useState(false);

  const loadPhotos = () => {
    setLoadingPhotos(true);
    getEventPhotos(event.event_id)
      .then(data => setPhotos(data.photos || []))
      .catch(() => setPhotos([]))
      .finally(() => setLoadingPhotos(false));
  };

  useEffect(() => { loadPhotos(); }, [event.event_id]);

  const handleDeletePhoto = async (filename) => {
    setDeletingPhoto(filename);
    try {
      await deleteEventPhoto(event.event_id, filename);
      setPhotos(prev => prev.filter(p => p !== filename));
    } catch { /* ignorar */ }
    finally { setDeletingPhoto(null); }
  };

  const handleAddPhotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setAddingPhotos(true);
    try {
      await addEventPhotos(event.event_id, files);
      loadPhotos();
    } catch { /* ignorar */ }
    finally { setAddingPhotos(false); e.target.value = ""; }
  };

  return (
    <div className="bg-x-surface border border-x-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-x-border">
        <p className="text-xs font-semibold text-x-muted uppercase tracking-wider mb-1">Evento</p>
        <h3 className="font-bold text-x-text text-base">{event.event_name}</h3>
        <div className="flex gap-6 mt-3">
          <QuickStat label="Fotos"           value={photos.length || event.total_photos || 0} />
          <QuickStat label="Caras indexadas" value={event.indexed_faces || 0} accent />
        </div>
      </div>

      {/* Foto grid */}
      <div className="p-4">
        {loadingPhotos ? (
          <div className="flex justify-center py-8">
            <Loader size={20} className="animate-spin text-x-faint" />
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-8 text-x-faint">
            <Image size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-xs">Sin fotos disponibles</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-x-faint mb-3">{photos.length} foto{photos.length !== 1 ? "s" : ""}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
              {photos.map(filename => (
                <div key={filename} className="relative group">
                  <a href={getEventPhotoUrl(event.event_id, filename)} target="_blank" rel="noreferrer">
                    <img
                      src={getEventPhotoUrl(event.event_id, filename)}
                      alt={filename}
                      className="w-full aspect-square object-cover rounded-lg group-hover:opacity-75 transition-opacity"
                      loading="lazy"
                    />
                  </a>
                  <button
                    onClick={() => handleDeletePhoto(filename)}
                    disabled={deletingPhoto === filename}
                    className="absolute top-1 right-1 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 hover:bg-red-700 text-white"
                    title="Eliminar foto"
                  >
                    {deletingPhoto === filename
                      ? <Loader size={10} className="animate-spin" />
                      : <Trash2 size={10} />
                    }
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <label className="flex-1 cursor-pointer">
          <div className={`flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-medium transition-colors
            ${addingPhotos
              ? "border-x-border text-x-faint cursor-not-allowed"
              : "border-x-border text-x-muted hover:text-x-text hover:border-x-border2"
            }`}>
            {addingPhotos ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {addingPhotos ? "Agregando..." : "Agregar fotos"}
          </div>
          <input type="file" accept="image/*" multiple onChange={handleAddPhotos} disabled={addingPhotos} className="hidden" />
        </label>
        <button
          onClick={onShare}
          className="flex-1 flex items-center justify-center gap-2 bg-lime text-x-ink rounded-xl py-2.5 text-sm font-bold hover:bg-lime-dim transition-colors"
        >
          <Share2 size={14} />
          Compartir
        </button>
      </div>
    </div>
  );
}


export default function CohortDetail({ cohort, onBack, participantCount }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showShare, setShowShare] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await getCohortEvents(cohort.id);
      setEvents(data);
    } catch { /* ignorar */ }
    finally { setLoading(false); }
  };

  const refreshEvents = async () => {
    try {
      const data = await getCohortEvents(cohort.id);
      setEvents(data);
    } catch { /* ignorar */ }
  };

  useEffect(() => { loadEvents(); }, [cohort.id]);

  // Poll every 3s while any event is still processing
  useEffect(() => {
    const hasProcessing = events.some(e => e.status === "processing" || e.status === "pending");
    if (!hasProcessing) return;
    const timer = setInterval(refreshEvents, 3000);
    return () => clearInterval(timer);
  }, [events]);

  // Keep selectedEvent in sync when events list refreshes
  useEffect(() => {
    if (!selectedEvent) return;
    const fresh = events.find(e => e.event_id === selectedEvent.event_id);
    if (fresh && (fresh.total_photos !== selectedEvent.total_photos || fresh.indexed_faces !== selectedEvent.indexed_faces)) {
      setSelectedEvent(fresh);
    }
  }, [events]);

  const handleSelectEvent = (event) => {
    if (event.status !== "done") return;
    setSelectedEvent(event);
    setShowUpload(false);
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await deleteEvent(eventId);
      setEvents(prev => prev.filter(e => e.event_id !== eventId));
      if (selectedEvent?.event_id === eventId) {
        setSelectedEvent(null);
      }
    } catch { /* ignorar */ }
  };

  const handleNewResults = (results) => {
    setShowUpload(false);
    loadEvents();
    setSelectedEvent({ event_id: results.event_id, event_name: results.event_name, status: "done" });
  };

  const totalPhotos = events.reduce((s, e) => s + (e.total_photos || 0), 0);
  const totalFaces  = events.reduce((s, e) => s + (e.indexed_faces || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <button
          onClick={onBack}
          className="mt-1 p-2 border border-x-border rounded-xl text-x-muted hover:text-x-text hover:border-x-border2 transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          {cohort.program && (
            <span
              className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2"
              style={{
                color: cohort.cover_color || "#ebff6f",
                background: `${cohort.cover_color || "#ebff6f"}18`,
                border: `1px solid ${cohort.cover_color || "#ebff6f"}30`,
              }}
            >
              {cohort.program}
            </span>
          )}
          <h2 className="text-2xl font-bold text-x-text">{cohort.name}</h2>
          {cohort.description && (
            <p className="text-x-muted text-sm mt-1">{cohort.description}</p>
          )}
          <div className="flex gap-6 mt-3">
            <QuickStat label="Eventos"         value={events.length} />
            <QuickStat label="Fotos"           value={totalPhotos} />
            <QuickStat label="Caras indexadas" value={totalFaces} accent />
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-2 border border-x-border text-x-muted rounded-xl px-4 py-2.5 text-sm font-medium hover:text-x-text hover:border-x-border2 transition-colors"
            title="Compartir portal con participantes"
          >
            <Share2 size={15} />
            Compartir
          </button>
          <button
            onClick={() => { setShowUpload(v => !v); setSelectedEvent(null); }}
            className="flex items-center gap-2 bg-lime text-x-ink rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-lime-dim transition-colors"
          >
            <Upload size={15} />
            Subir Evento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

        {/* Izquierda: lista de eventos */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-x-muted uppercase tracking-wider mb-3">
            Eventos en este cohort
          </p>

          {loading && (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-16 bg-x-surface2 border border-x-border rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!loading && events.length === 0 && !showUpload && (
            <div className="text-center py-10 border border-dashed border-x-border rounded-2xl">
              <Camera size={28} className="text-x-faint mx-auto mb-2" />
              <p className="text-sm text-x-muted">Sin eventos todavía</p>
              <p className="text-xs text-x-faint mt-1">Sube fotos de un evento para empezar</p>
            </div>
          )}

          {events.map(ev => (
            <EventRow
              key={ev.event_id}
              event={ev}
              onSelect={handleSelectEvent}
              isSelected={selectedEvent?.event_id === ev.event_id}
              onDelete={handleDeleteEvent}
            />
          ))}
        </div>

        {/* Derecha: subir o resultados */}
        <div>
          {showUpload && (
            <div className="bg-x-surface border border-x-border rounded-2xl p-6">
              <p className="text-xs font-semibold text-x-muted uppercase tracking-wider mb-5">
                Subir fotos a "{cohort.name}"
              </p>

              {participantCount === 0 && (
                <div className="flex items-start gap-3 border border-yellow-800/50 bg-yellow-950/20 rounded-xl p-4 mb-5 text-sm text-yellow-400">
                  <span className="text-base leading-none mt-0.5">⚠</span>
                  <div>
                    <p className="font-semibold">Sin participantes con foto de referencia</p>
                    <p className="text-xs text-yellow-500/80 mt-1">
                      El reconocimiento facial no encontrará a nadie. Ve a <strong>Participantes</strong> y sube al menos una foto antes de procesar el evento.
                    </p>
                  </div>
                </div>
              )}

              <UploadZip
                cohortId={cohort.id}
                onResults={handleNewResults}
              />
            </div>
          )}

          {!showUpload && selectedEvent && (
            <EventDetail
              event={selectedEvent}
              onShare={() => setShowShare(true)}
            />
          )}

          {!showUpload && !selectedEvent && (
            <div className="text-center py-20 border border-dashed border-x-border rounded-2xl text-x-faint">
              <Camera size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Selecciona un evento para ver sus detalles</p>
              <p className="text-xs mt-1">o sube las fotos de un nuevo evento</p>
            </div>
          )}
        </div>
      </div>
      {showShare && <ShareModal onClose={() => setShowShare(false)} cohort={cohort} />}
    </div>
  );
}

function QuickStat({ label, value, accent }) {
  return (
    <div>
      <span className={`text-lg font-black ${accent ? "text-lime" : "text-x-text"}`}>{value}</span>
      <span className="text-xs text-x-faint ml-1.5">{label}</span>
    </div>
  );
}
