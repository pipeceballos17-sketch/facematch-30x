import { useState, useEffect, useRef } from "react";
import {
  Camera, Loader, Download,
  X, ArrowLeft, ImageOff, CalendarDays, ChevronRight, Images,
  Search, Sparkles, FolderOpen, Image as ImageIcon,
} from "lucide-react";
import {
  listPortalCohorts, getCohortPortalInfo,
  matchSelfieInCohort, getEventPhotoUrl,
} from "../api";

const LOGO = "https://res.cloudinary.com/do4mzgggm/image/upload/v1772313637/Negro_1_w5zt0g.png";

function formatEventDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  } catch { return ""; }
}

// ─────────────────────────────────────────────────────────────────────────────
// LANDING
// ─────────────────────────────────────────────────────────────────────────────
function Landing() {
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPortalCohorts()
      .then(setCohorts)
      .finally(() => setLoading(false));
  }, []);

  const goToCohort = (cohortId) => {
    window.location.hash = `#portal/${cohortId}`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#111827" }} className="flex flex-col">

      <header style={{ borderBottom: "1px solid #E5E7EB", background: "#fff" }} className="sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-5 h-14 flex items-center">
          <img src={LOGO} alt="30X" className="h-7" />
        </div>
      </header>

      <section style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
        <div className="max-w-xl mx-auto px-5 py-16 text-center">

          <span
            className="inline-block text-[10px] font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1 mb-6"
            style={{ background: "#CCFF4720", color: "#6B9900", border: "1px solid #CCFF4760" }}
          >
            Comunidad 30X
          </span>

          <h1 className="text-4xl font-black leading-[1.1] mb-5" style={{ color: "#111827" }}>
            Gracias por ser<br />
            <span style={{ color: "#7DB000" }}>parte de 30X.</span>
          </h1>

          <p className="text-base leading-relaxed max-w-sm mx-auto" style={{ color: "#6B7280" }}>
            Aquí encontrarás todas tus fotos de los eventos 30X.
            Solo sube una selfie y nuestro sistema te identifica automáticamente.
          </p>
        </div>
      </section>

      <div className="max-w-xl mx-auto px-5 w-full pb-16 flex-1">

        <div className="mt-10 mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "#9CA3AF" }}>
            Cómo funciona
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { n: "01", icon: FolderOpen, title: "Selecciona tu cohort",   sub: "El programa al que perteneces" },
              { n: "02", icon: Camera,     title: "Sube una selfie",        sub: "Una foto clara, de frente" },
              { n: "03", icon: Sparkles,   title: "Te identificamos",       sub: "En todos los días del evento" },
              { n: "04", icon: Download,   title: "Descarga tus fotos",     sub: "Agrupadas por día" },
            ].map(({ n, icon: Icon, title, sub }) => (
              <div
                key={n}
                className="rounded-2xl p-4"
                style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: "#CCFF4725" }}
                >
                  <Icon size={15} style={{ color: "#6B9900" }} />
                </div>
                <p className="text-xs font-bold mb-0.5" style={{ color: "#111827" }}>{title}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: "#9CA3AF" }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#9CA3AF" }}>
          ¿En qué cohort estuviste?
        </p>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader size={24} className="animate-spin" style={{ color: "#CCFF47" }} />
          </div>
        )}

        {!loading && cohorts.filter(c => c.total_photos > 0).length === 0 && (
          <div
            className="text-center py-14 rounded-2xl"
            style={{ border: "2px dashed #E5E7EB" }}
          >
            <CalendarDays size={28} className="mx-auto mb-3" style={{ color: "#D1D5DB" }} />
            <p className="text-sm" style={{ color: "#9CA3AF" }}>Aún no hay eventos disponibles.</p>
          </div>
        )}

        {!loading && cohorts.filter(c => c.total_photos > 0).length > 0 && (
          <div className="space-y-2.5">
            {cohorts.filter(c => c.total_photos > 0).map(c => (
              <button
                key={c.cohort_id}
                onClick={() => goToCohort(c.cohort_id)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all"
                style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "#CCFF47";
                  e.currentTarget.style.background = "#FCFFE8";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "#E5E7EB";
                  e.currentTarget.style.background = "#F9FAFB";
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: `${c.cover_color || "#CCFF47"}20`,
                    border: `1px solid ${c.cover_color || "#CCFF47"}50`,
                  }}
                >
                  <Images size={16} style={{ color: c.cover_color || "#AEDD2E" }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "#111827" }}>
                    {c.cohort_name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                    {c.program && <span>{c.program} · </span>}
                    {c.total_photos} fotos
                    {c.event_count > 1 && <span> · {c.event_count} días</span>}
                  </p>
                </div>

                <ChevronRight size={16} style={{ color: "#D1D5DB" }} />
              </button>
            ))}
          </div>
        )}

        <div className="text-center mt-14">
          <p className="text-xs leading-relaxed" style={{ color: "#D1D5DB" }}>
            No te preparamos para el futuro.{" "}
            <span style={{ color: "#AEDD2E", fontWeight: 600 }}>Te ponemos a construirlo.</span>
          </p>
          <p className="text-[10px] mt-2" style={{ color: "#E5E7EB" }}>
            30X Facematch · {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL — cohort seleccionado (selfie única → resultados de todos los días)
// ─────────────────────────────────────────────────────────────────────────────
function CohortPortal({ cohortId }) {
  const [cohortInfo, setCohortInfo]   = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError]     = useState(null);

  const [step, setStep]                 = useState("upload");  // upload | matching | results
  const [selfieFile, setSelfieFile]     = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [matching, setMatching]         = useState(false);
  const [matchError, setMatchError]     = useState(null);
  const [resultEvents, setResultEvents] = useState([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [usedWideSearch, setUsedWideSearch] = useState(false);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    getCohortPortalInfo(cohortId)
      .then(setCohortInfo)
      .catch(() => setInfoError("Cohort no encontrado o aún procesando."))
      .finally(() => setLoadingInfo(false));
  }, [cohortId]);

  const resetSelfie = () => {
    setSelfieFile(null);
    setSelfiePreview(null);
    setMatchError(null);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
    setMatchError(null);
    e.target.value = ""; // allow re-picking same file
  };

  const handleMatch = async (wide = false) => {
    if (!selfieFile || !cohortInfo) return;
    setMatching(true);
    setUsedWideSearch(wide);
    setStep("matching");
    try {
      const result = await matchSelfieInCohort(cohortId, selfieFile, wide ? 0.62 : null);
      setResultEvents(result.events || []);
      setTotalMatches(result.total_matches || 0);
      setStep("results");
    } catch {
      setMatchError("Error al procesar tu selfie. Intenta con otra foto.");
      setStep("upload");
    } finally {
      setMatching(false);
    }
  };

  const handleDownloadAll = () => {
    let i = 0;
    resultEvents.forEach(ev => {
      ev.matched_photos.forEach(filename => {
        setTimeout(() => {
          const a = document.createElement("a");
          a.href = getEventPhotoUrl(ev.event_id, filename);
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, i * 400);
        i++;
      });
    });
  };

  const goBackToLanding = () => { window.location.hash = "#portal"; };

  const topBar = (title, subtitle, onBack) => (
    <header style={{ borderBottom: "1px solid #E5E7EB", background: "#fff" }} className="sticky top-0 z-10">
      <div className="max-w-xl mx-auto px-5 h-14 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl transition-colors"
          style={{ border: "1px solid #E5E7EB", color: "#6B7280" }}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          {subtitle && <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{subtitle}</p>}
          {title && <p className="text-sm font-bold truncate" style={{ color: "#111827" }}>{title}</p>}
        </div>
        <img src={LOGO} alt="30X" className="h-6 shrink-0" />
      </div>
    </header>
  );

  if (loadingInfo) return (
    <div style={{ minHeight: "100vh", background: "#fff" }} className="flex items-center justify-center">
      <Loader size={32} className="animate-spin" style={{ color: "#CCFF47" }} />
    </div>
  );

  if (infoError) return (
    <div style={{ minHeight: "100vh", background: "#fff" }} className="flex flex-col items-center justify-center p-6 text-center gap-4">
      <img src={LOGO} alt="30X" className="h-8" />
      <p className="text-sm" style={{ color: "#6B7280" }}>{infoError}</p>
      <button onClick={goBackToLanding} className="text-sm underline underline-offset-2" style={{ color: "#AEDD2E" }}>
        Volver al inicio
      </button>
    </div>
  );

  const totalPhotosInCohort = (cohortInfo.events || []).reduce((s, e) => s + (e.total_photos || 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#111827" }}>
      {topBar(cohortInfo.cohort_name, cohortInfo.program || "Cohort", goBackToLanding)}

      <div className="max-w-xl mx-auto px-5 py-8">

        {/* ── Upload selfie ────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-6" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
              <div className="text-center mb-6">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: "#CCFF4720" }}
                >
                  <Search size={24} style={{ color: "#6B9900" }} />
                </div>
                <h2 className="font-bold text-lg mb-1" style={{ color: "#111827" }}>Encuéntrate en las fotos</h2>
                <p className="text-sm" style={{ color: "#6B7280" }}>
                  Sube una selfie y te buscamos en {totalPhotosInCohort} fotos
                  {cohortInfo.events?.length > 1 && ` de ${cohortInfo.events.length} días`}.
                </p>
              </div>

              {/* Preview */}
              {selfiePreview ? (
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <img
                      src={selfiePreview}
                      alt="Tu selfie"
                      className="w-32 h-32 rounded-full object-cover"
                      style={{ border: "3px solid #CCFF47" }}
                    />
                    <button
                      onClick={resetSelfie}
                      className="absolute -top-1 -right-1 rounded-full p-1"
                      style={{ background: "#fff", border: "1px solid #E5E7EB", color: "#9CA3AF" }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl transition-all"
                    style={{ background: "#fff", border: "1px solid #E5E7EB" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#CCFF47"; e.currentTarget.style.background = "#FCFFE8"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: "#CCFF4725" }}
                    >
                      <Camera size={22} style={{ color: "#6B9900" }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: "#111827" }}>Tomar selfie</span>
                    <span className="text-[11px]" style={{ color: "#9CA3AF" }}>Usar la cámara</span>
                  </button>

                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl transition-all"
                    style={{ background: "#fff", border: "1px solid #E5E7EB" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#CCFF47"; e.currentTarget.style.background = "#FCFFE8"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: "#F3F4F6" }}
                    >
                      <ImageIcon size={22} style={{ color: "#6B7280" }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: "#111827" }}>Desde galería</span>
                    <span className="text-[11px]" style={{ color: "#9CA3AF" }}>Elegir una foto</span>
                  </button>

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}

              {matchError && <p className="text-red-500 text-xs text-center mb-3">{matchError}</p>}

              <button
                onClick={() => handleMatch(false)}
                disabled={!selfieFile || matching}
                className="w-full font-bold py-3 rounded-xl transition-colors disabled:opacity-40"
                style={{ background: "#CCFF47", color: "#111827" }}
                onMouseEnter={e => { if (selfieFile) e.currentTarget.style.background = "#AEDD2E"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#CCFF47"; }}
              >
                Buscar mis fotos
              </button>
            </div>

            <p className="text-[11px] text-center" style={{ color: "#9CA3AF" }}>
              Tip: usa una foto con buena luz, de frente y con tu cara despejada.
            </p>
          </div>
        )}

        {/* ── Matching ─────────────────────────────────────────── */}
        {step === "matching" && (
          <div className="text-center py-24">
            <div className="relative inline-block mb-6">
              <Loader size={52} className="animate-spin" style={{ color: "#CCFF47" }} />
              <Sparkles size={20} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: "#6B9900" }} />
            </div>
            <p className="font-bold text-lg mb-1" style={{ color: "#111827" }}>Buscando tu cara...</p>
            <p className="text-sm" style={{ color: "#9CA3AF" }}>
              Analizando {totalPhotosInCohort} fotos
              {cohortInfo.events?.length > 1 && ` de ${cohortInfo.events.length} días`}
            </p>
          </div>
        )}

        {/* ── Resultados ───────────────────────────────────────── */}
        {step === "results" && (
          <div>
            <div
              className="rounded-2xl p-4 mb-6 flex items-center gap-3"
              style={{
                background: totalMatches > 0 ? "#F0FFF4" : "#FFF5F5",
                border: `1px solid ${totalMatches > 0 ? "#BBF7D0" : "#FECACA"}`,
              }}
            >
              <button
                onClick={() => { setStep("upload"); setResultEvents([]); setTotalMatches(0); }}
                className="p-1.5 rounded-lg shrink-0"
                style={{ border: "1px solid #E5E7EB", color: "#9CA3AF", background: "#fff" }}
              >
                <ArrowLeft size={14} />
              </button>
              <div>
                <h2 className="font-bold text-sm" style={{ color: "#111827" }}>
                  {totalMatches > 0
                    ? `¡Apareces en ${totalMatches} foto${totalMatches !== 1 ? "s" : ""}!`
                    : "No te encontramos"}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                  {totalMatches > 0
                    ? "Toca para ver en grande · descarga todas abajo"
                    : "Intenta con una foto más clara y de frente"}
                </p>
              </div>
            </div>

            {totalMatches > 0 ? (
              <>
                {resultEvents.filter(ev => ev.count > 0).map((ev, idx) => (
                  <div key={ev.event_id} className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: "#CCFF4720" }}
                        >
                          <CalendarDays size={13} style={{ color: "#6B9900" }} />
                        </div>
                        <div>
                          <p className="text-sm font-bold" style={{ color: "#111827" }}>
                            {resultEvents.length > 1 ? `Día ${idx + 1} — ` : ""}{ev.event_name}
                          </p>
                          {ev.created_at && (
                            <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                              {formatEventDate(ev.created_at)}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-bold" style={{ color: "#6B9900" }}>
                        {ev.count} foto{ev.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {ev.matched_photos.map(filename => (
                        <a key={filename} href={getEventPhotoUrl(ev.event_id, filename)} target="_blank" rel="noreferrer">
                          <img
                            src={getEventPhotoUrl(ev.event_id, filename)}
                            alt={filename}
                            className="w-full aspect-square object-cover rounded-xl transition-all hover:opacity-90"
                            style={{ border: "1px solid #E5E7EB" }}
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleDownloadAll}
                  className="w-full flex items-center justify-center gap-2 font-bold py-3 rounded-xl transition-colors"
                  style={{ background: "#CCFF47", color: "#111827" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#AEDD2E"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#CCFF47"; }}
                >
                  <Download size={16} /> Descargar todas mis fotos
                </button>
              </>
            ) : (
              <div className="text-center py-10 rounded-2xl" style={{ border: "2px dashed #E5E7EB" }}>
                <ImageOff size={32} className="mx-auto mb-3" style={{ color: "#D1D5DB" }} />
                <p className="text-sm mb-1" style={{ color: "#6B7280" }}>No encontramos tu cara en este cohort.</p>
                <p className="text-xs" style={{ color: "#9CA3AF" }}>
                  {usedWideSearch
                    ? "Prueba con una foto más clara, de frente y con buena iluminación."
                    : "Puede que la foto no sea suficientemente clara."}
                </p>

                <div className="mt-5 flex flex-col items-center gap-2">
                  {!usedWideSearch && (
                    <button
                      onClick={() => handleMatch(true)}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                      style={{ background: "#CCFF4720", border: "1px solid #CCFF4760", color: "#6B9900" }}
                    >
                      Buscar con menor precisión
                    </button>
                  )}
                  <button
                    onClick={() => { setStep("upload"); resetSelfie(); setResultEvents([]); setTotalMatches(0); setUsedWideSearch(false); }}
                    className="px-5 py-2.5 rounded-xl text-sm transition-colors"
                    style={{ border: "1px solid #E5E7EB", color: "#6B7280", background: "#fff" }}
                  >
                    Intentar con otra foto
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export default function Portal({ cohortId }) {
  if (!cohortId) return <Landing />;
  return <CohortPortal cohortId={cohortId} />;
}
