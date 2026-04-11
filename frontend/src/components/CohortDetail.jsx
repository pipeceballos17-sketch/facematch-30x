import { useState, useEffect } from "react";
import {
  ArrowLeft, Upload, Camera, CheckCircle, Loader,
  XCircle, ChevronRight, Image, Users, FileSpreadsheet
} from "lucide-react";
import { getCohortEvents, getEventResults } from "../api";
import UploadZip from "./UploadZip";
import Results from "./Results";

function EventRow({ event, onSelect, isSelected }) {
  const statusIcon = {
    done:       <CheckCircle size={14} className="text-lime" />,
    processing: <Loader      size={14} className="text-blue-400 animate-spin" />,
    pending:    <Loader      size={14} className="text-x-faint animate-spin" />,
    error:      <XCircle     size={14} className="text-red-400" />,
  }[event.status] || null;

  const date = event.created_at
    ? new Date(event.created_at).toLocaleDateString("es-MX", { month: "short", day: "numeric" })
    : "";

  return (
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

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isSelected ? "text-lime" : "text-x-text"}`}>
          {event.event_name}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-x-faint flex items-center gap-1">
            <Image size={10} /> {event.matched_photos} photos
          </span>
          <span className="text-xs text-x-faint flex items-center gap-1">
            <Users size={10} /> {event.matched_participants} people
          </span>
          {date && <span className="text-xs text-x-faint">{date}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {statusIcon}
        <ChevronRight size={14} className={isSelected ? "text-lime" : "text-x-faint"} />
      </div>
    </button>
  );
}

export default function CohortDetail({ cohort, onBack, participantCount }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventResults, setEventResults] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await getCohortEvents(cohort.id);
      setEvents(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadEvents(); }, [cohort.id]);

  const handleSelectEvent = async (event) => {
    if (event.status !== "done") return;
    setSelectedEvent(event);
    setEventResults(null);
    setLoadingResults(true);
    try {
      const results = await getEventResults(event.event_id);
      setEventResults(results);
    } catch { /* ignore */ }
    finally { setLoadingResults(false); }
  };

  const handleNewResults = (results) => {
    setEventResults(results);
    setShowUpload(false);
    loadEvents(); // refresh event list
    setSelectedEvent({ event_id: results.event_id, event_name: results.event_name, status: "done" });
  };

  const totalPhotos       = events.reduce((s, e) => s + (e.matched_photos || 0), 0);
  const totalParticipants = events.reduce((s, e) => s + (e.matched_participants || 0), 0);

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
                color: cohort.cover_color || "#CCFF47",
                background: `${cohort.cover_color || "#CCFF47"}18`,
                border: `1px solid ${cohort.cover_color || "#CCFF47"}30`,
              }}
            >
              {cohort.program}
            </span>
          )}
          <h2 className="text-2xl font-bold text-x-text">{cohort.name}</h2>
          {cohort.description && (
            <p className="text-x-muted text-sm mt-1">{cohort.description}</p>
          )}
          {/* Quick stats */}
          <div className="flex gap-6 mt-3">
            <QuickStat label="Events"  value={events.length} />
            <QuickStat label="Photos matched"  value={totalPhotos} />
            <QuickStat label="People matched"  value={totalParticipants} accent />
          </div>
        </div>
        <button
          onClick={() => { setShowUpload(v => !v); setSelectedEvent(null); setEventResults(null); }}
          className="flex items-center gap-2 bg-lime text-x-bg rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-lime-dim transition-colors lime-glow-sm shrink-0"
        >
          <Upload size={15} />
          Upload Event
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

        {/* Left: event list */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-x-muted uppercase tracking-wider mb-3">
            Events in this cohort
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
              <p className="text-sm text-x-muted">No events yet</p>
              <p className="text-xs text-x-faint mt-1">Upload event photos to get started</p>
            </div>
          )}

          {events.map(ev => (
            <EventRow
              key={ev.event_id}
              event={ev}
              onSelect={handleSelectEvent}
              isSelected={selectedEvent?.event_id === ev.event_id}
            />
          ))}
        </div>

        {/* Right: upload or results panel */}
        <div>
          {showUpload && (
            <div className="bg-x-surface border border-x-border rounded-2xl p-6">
              <p className="text-xs font-semibold text-x-muted uppercase tracking-wider mb-5">
                Upload photos to "{cohort.name}"
              </p>
              <UploadZip
                cohortId={cohort.id}
                onResults={handleNewResults}
                participantCount={participantCount}
              />
            </div>
          )}

          {!showUpload && selectedEvent && (
            <div className="bg-x-surface border border-x-border rounded-2xl p-6">
              {loadingResults ? (
                <div className="flex items-center justify-center py-16">
                  <Loader size={28} className="animate-spin text-lime" />
                </div>
              ) : eventResults ? (
                <Results results={eventResults} />
              ) : (
                <p className="text-x-muted text-center py-10 text-sm">
                  Could not load results for this event.
                </p>
              )}
            </div>
          )}

          {!showUpload && !selectedEvent && (
            <div className="text-center py-20 border border-dashed border-x-border rounded-2xl text-x-faint">
              <FileSpreadsheet size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select an event to see results</p>
              <p className="text-xs mt-1">or upload new event photos</p>
            </div>
          )}
        </div>
      </div>
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
