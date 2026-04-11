import { Download, Users, ImageOff, Package, Phone, FileText } from "lucide-react";
import { getDownloadUrl, getAllDownloadUrl, getManifestUrl, getParticipantPhotoUrl } from "../api";

// Format a phone number into a WhatsApp link
function whatsappLink(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

export default function Results({ results }) {
  if (!results) return null;

  const { event_id, event_name, matches, unmatched_photos, total_faces_detected } = results;
  const totalMatched = matches.reduce((s, m) => s + m.match_count, 0);

  return (
    <div className="space-y-7">

      {/* Event name */}
      <div>
        <p className="text-xs font-semibold text-x-muted uppercase tracking-wider mb-1">Event</p>
        <h3 className="text-lg font-bold text-x-text">{event_name}</h3>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Matched"     value={matches.length}         sub="participants" />
        <StatCard label="Photos"      value={totalMatched}           sub="matched" highlight />
        <StatCard label="Faces"       value={total_faces_detected}   sub="detected" />
      </div>

      {/* Download all + manifest */}
      {matches.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={getAllDownloadUrl(event_id)}
            download
            className="flex-1 flex items-center justify-center gap-2 bg-lime text-x-bg rounded-xl py-3 font-bold hover:bg-lime-dim transition-colors lime-glow text-sm"
          >
            <Package size={16} />
            Download All (ZIP by person)
          </a>
          <a
            href={getManifestUrl(event_id)}
            download
            className="flex items-center justify-center gap-2 border border-x-border text-x-muted rounded-xl px-5 py-3 font-medium hover:text-x-text hover:border-x-border2 transition-colors text-sm"
          >
            <FileText size={16} />
            Name + Phone CSV
          </a>
        </div>
      )}

      {/* Per-person rows */}
      {matches.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-x-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users size={12} /> Matched Participants
          </p>
          <div className="space-y-3">
            {matches.map(match => (
              <ParticipantRow key={match.participant_id} match={match} eventId={event_id} />
            ))}
          </div>
        </div>
      )}

      {/* Unmatched */}
      {unmatched_photos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-x-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <ImageOff size={12} /> Unmatched Photos ({unmatched_photos.length})
          </p>
          <div className="bg-x-surface2 border border-x-border rounded-xl p-4">
            <p className="text-xs text-x-muted mb-3">
              No face match found — people may not be in the participant list, or faces were too small/blurry.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unmatched_photos.map(name => (
                <span key={name} className="text-xs bg-x-bg border border-x-border rounded px-2 py-0.5 text-x-faint">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {matches.length === 0 && (
        <div className="text-center py-12">
          <Users size={36} className="mx-auto mb-3 text-x-faint opacity-40" />
          <p className="font-semibold text-x-muted">No matches found</p>
          <p className="text-xs mt-1 text-x-faint">
            Make sure participants have clear reference photos and faces are visible.
          </p>
        </div>
      )}
    </div>
  );
}

function ParticipantRow({ match, eventId }) {
  const waLink = whatsappLink(match.participant_phone);

  return (
    <div className="bg-x-surface2 border border-x-border rounded-xl p-4 hover:border-x-border2 transition-colors">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full overflow-hidden bg-x-bg border border-x-border shrink-0">
          <img
            src={`${getParticipantPhotoUrl(match.participant_id)}?t=1`}
            alt={match.participant_name}
            className="w-full h-full object-cover"
            onError={e => { e.target.style.display = "none"; }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-x-text">{match.participant_name}</p>

          {/* Phone + WhatsApp */}
          {match.participant_phone ? (
            <div className="flex items-center gap-2 mt-0.5">
              <Phone size={11} className="text-x-faint shrink-0" />
              <span className="text-xs text-x-muted">{match.participant_phone}</span>
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-green-700/50 text-green-400 bg-green-950/30 hover:bg-green-900/40 transition-colors"
                >
                  WhatsApp
                </a>
              )}
            </div>
          ) : (
            <p className="text-xs text-x-faint mt-0.5">No phone on file</p>
          )}

          {/* Matched count + thumbnails */}
          <p className="text-xs text-x-faint mt-2">
            {match.match_count} photo{match.match_count !== 1 ? "s" : ""} matched
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {match.photo_filenames.slice(0, 5).map(f => (
              <span key={f} className="text-xs bg-x-bg border border-x-border rounded px-1.5 py-0.5 text-x-faint truncate max-w-[130px]">
                {f}
              </span>
            ))}
            {match.photo_filenames.length > 5 && (
              <span className="text-xs text-x-faint">+{match.photo_filenames.length - 5} more</span>
            )}
          </div>
        </div>

        {/* Download */}
        <a
          href={getDownloadUrl(eventId, match.participant_id)}
          download
          onClick={e => e.stopPropagation()}
          className="shrink-0 flex items-center gap-1.5 border border-lime/40 text-lime rounded-lg px-3 py-2 text-xs font-bold hover:bg-lime/10 transition-colors"
        >
          <Download size={13} />
          Download
        </a>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, highlight }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${
      highlight ? "border-lime/30 bg-lime/5" : "border-x-border bg-x-surface2"
    }`}>
      <p className={`text-3xl font-black ${highlight ? "text-lime" : "text-x-text"}`}>{value}</p>
      <p className={`text-xs mt-1 font-semibold ${highlight ? "text-lime/70" : "text-x-muted"}`}>{label}</p>
      <p className="text-[10px] text-x-faint">{sub}</p>
    </div>
  );
}
