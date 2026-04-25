import { useState, useEffect, useRef } from "react";
import {
  Camera, Loader, Download,
  X, ArrowLeft, ImageOff, CalendarDays, ChevronRight, Images,
  Search, Sparkles, FolderOpen, Image as ImageIcon, Check,
} from "lucide-react";
import {
  listPortalCohorts, getCohortPortalInfo,
  matchSelfieInCohort, getCohortPhotoUrl,
  downloadCohortSelection,
} from "../api";

// iOS-aware download/share. On iPhone <a download> is unreliable for
// cross-origin URLs and even for blob URLs created after `await`. We try
// (in order):
//   1. Web Share API with the file — native iOS sheet ("Save to Files"/"Photos")
//   2. <a download> — works on desktop + Android
//   3. Open in new tab — last resort, iOS shows native download UI
async function shareOrDownloadBlob(blob, filename) {
  if (!blob) return;
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) {
      if (e?.name === "AbortError") return; // user cancelled — don't fall through
      // any other error → fall through to <a download>
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

// For a known direct URL with Content-Disposition: attachment, iOS Safari
// honors a new-tab open by showing its native download dialog without
// actually navigating away.
function openDownloadInNewTab(url) {
  const w = window.open(url, "_blank", "noopener");
  if (!w) window.location.href = url; // popup blocked → navigate
}

const LOGO = "https://res.cloudinary.com/do4mzgggm/image/upload/v1772313638/image_74_zxymrr.png";

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
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fafafa" }} className="flex flex-col">

      <header style={{ borderBottom: "1px solid #2d2d2d", background: "#0a0a0a" }} className="sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-5 h-14 flex items-center">
          <img src={LOGO} alt="30X" className="h-7" />
        </div>
      </header>

      <section style={{ background: "#1c1c1c", borderBottom: "1px solid #2d2d2d" }}>
        <div className="max-w-xl mx-auto px-5 py-16 text-center">

          <span
            className="inline-block text-[10px] font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1 mb-6"
            style={{ background: "#ebff6f20", color: "#ebff6f", border: "1px solid #ebff6f60" }}
          >
            Comunidad 30X
          </span>

          <h1 className="text-4xl font-black leading-[1.1] mb-5" style={{ color: "#fafafa" }}>
            Gracias por ser<br />
            <span style={{ color: "#ebff6f" }}>parte de 30X.</span>
          </h1>

          <p className="text-base leading-relaxed max-w-sm mx-auto" style={{ color: "#fafafa" }}>
            Aquí encontrarás todas tus fotos de los eventos 30X.
            Solo sube una selfie y nuestro sistema te identifica automáticamente.
          </p>
        </div>
      </section>

      <div className="max-w-xl mx-auto px-5 w-full pb-16 flex-1">

        <div className="mt-10 mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "#fafafa" }}>
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
                style={{ background: "#1c1c1c", border: "1px solid #2d2d2d" }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: "#ebff6f25" }}
                >
                  <Icon size={15} style={{ color: "#ebff6f" }} />
                </div>
                <p className="text-xs font-bold mb-0.5" style={{ color: "#fafafa" }}>{title}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: "#fafafa" }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#fafafa" }}>
          ¿En qué cohort estuviste?
        </p>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader size={24} className="animate-spin" style={{ color: "#ebff6f" }} />
          </div>
        )}

        {!loading && cohorts.filter(c => c.total_photos > 0).length === 0 && (
          <div
            className="text-center py-14 rounded-2xl"
            style={{ border: "2px dashed #2d2d2d" }}
          >
            <CalendarDays size={28} className="mx-auto mb-3" style={{ color: "#ebff6f" }} />
            <p className="text-sm" style={{ color: "#fafafa" }}>Aún no hay eventos disponibles.</p>
          </div>
        )}

        {!loading && cohorts.filter(c => c.total_photos > 0).length > 0 && (
          <div className="space-y-2.5">
            {cohorts.filter(c => c.total_photos > 0).map(c => (
              <button
                key={c.cohort_id}
                onClick={() => goToCohort(c.cohort_id)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all"
                style={{ background: "#1c1c1c", border: "1px solid #2d2d2d" }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "#ebff6f";
                  e.currentTarget.style.background = "#1f2410";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "#2d2d2d";
                  e.currentTarget.style.background = "#1c1c1c";
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: `${c.cover_color || "#ebff6f"}20`,
                    border: `1px solid ${c.cover_color || "#ebff6f"}50`,
                  }}
                >
                  <Images size={16} style={{ color: c.cover_color || "#babe60" }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "#fafafa" }}>
                    {c.cohort_name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#fafafa" }}>
                    {c.program && <span>{c.program} · </span>}
                    {c.total_photos} fotos
                    {c.event_count > 1 && <span> · {c.event_count} días</span>}
                  </p>
                </div>

                <ChevronRight size={16} style={{ color: "#ebff6f" }} />
              </button>
            ))}
          </div>
        )}

        <div className="text-center mt-14">
          <p className="text-xs leading-relaxed" style={{ color: "#fafafa" }}>
            No te preparamos para el futuro.{" "}
            <span style={{ color: "#babe60", fontWeight: 600 }}>Te ponemos a construirlo.</span>
          </p>
          <p className="text-[10px] mt-2" style={{ color: "#2d2d2d" }}>
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
  const [resultPhotos, setResultPhotos] = useState([]);   // flat list of filenames
  const [usedWideSearch, setUsedWideSearch] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const toggleSelect = (filename) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const totalMatches = resultPhotos.length;

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
      setResultPhotos(result.matched_photos || []);
      setStep("results");
    } catch {
      setMatchError("Error al procesar tu selfie. Intenta con otra foto.");
      setStep("upload");
    } finally {
      setMatching(false);
    }
  };

  const handleDownloadAll = async () => {
    if (downloadingAll) return;
    const pool = resultPhotos;
    const selections = selected.size > 0
      ? pool.filter(f => selected.has(f))
      : pool;
    if (selections.length === 0) return;

    setDownloadingAll(true);
    try {
      if (selections.length === 1) {
        // Single photo → fetch as blob then share/download. The blob path
        // works on iOS via Web Share API ("Save to Files / Photos").
        const filename = selections[0];
        const url = `${getCohortPhotoUrl(cohortId, filename)}?download=1`;
        try {
          const res = await fetch(url, { credentials: "omit" });
          if (!res.ok) throw new Error("fetch failed");
          const blob = await res.blob();
          await shareOrDownloadBlob(blob, filename);
        } catch {
          // Network/CORS edge case — fall back to opening the URL directly.
          openDownloadInNewTab(url);
        }
      } else {
        const blob = await downloadCohortSelection(cohortId, selections);
        const safeName = (cohortInfo?.cohort_name || "fotos").replace(/\s+/g, "_");
        await shareOrDownloadBlob(blob, `${safeName}_30X.zip`);
      }
    } catch {
      setMatchError("No pudimos preparar la descarga. Intenta de nuevo.");
    } finally {
      setDownloadingAll(false);
    }
  };

  const goBackToLanding = () => { window.location.hash = "#portal"; };

  const topBar = (title, subtitle, onBack) => (
    <header style={{ borderBottom: "1px solid #2d2d2d", background: "#0a0a0a" }} className="sticky top-0 z-10">
      <div className="max-w-xl mx-auto px-5 h-14 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl transition-colors"
          style={{ border: "1px solid #2d2d2d", color: "#ebff6f" }}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          {subtitle && <p className="text-[11px]" style={{ color: "#fafafa" }}>{subtitle}</p>}
          {title && <p className="text-sm font-bold truncate" style={{ color: "#fafafa" }}>{title}</p>}
        </div>
        <img src={LOGO} alt="30X" className="h-6 shrink-0" />
      </div>
    </header>
  );

  if (loadingInfo) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a" }} className="flex items-center justify-center">
      <Loader size={32} className="animate-spin" style={{ color: "#ebff6f" }} />
    </div>
  );

  if (infoError) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a" }} className="flex flex-col items-center justify-center p-6 text-center gap-4">
      <img src={LOGO} alt="30X" className="h-8" />
      <p className="text-sm" style={{ color: "#fafafa" }}>{infoError}</p>
      <button onClick={goBackToLanding} className="text-sm underline underline-offset-2" style={{ color: "#babe60" }}>
        Volver al inicio
      </button>
    </div>
  );

  const totalPhotosInCohort = cohortInfo.total_photos || 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fafafa" }}>
      {topBar(cohortInfo.cohort_name, cohortInfo.program || "Cohort", goBackToLanding)}

      <div className="max-w-xl mx-auto px-5 py-8">

        {/* ── Upload selfie ────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-6" style={{ background: "#1c1c1c", border: "1px solid #2d2d2d" }}>
              <div className="text-center mb-6">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: "#ebff6f20" }}
                >
                  <Search size={24} style={{ color: "#ebff6f" }} />
                </div>
                <h2 className="font-bold text-lg mb-1" style={{ color: "#fafafa" }}>Encuéntrate en las fotos</h2>
                <p className="text-sm" style={{ color: "#fafafa" }}>
                  Sube una selfie y te buscamos en {totalPhotosInCohort} fotos.
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
                      style={{ border: "3px solid #ebff6f" }}
                    />
                    <button
                      onClick={resetSelfie}
                      className="absolute -top-1 -right-1 rounded-full p-1"
                      style={{ background: "#0a0a0a", border: "1px solid #2d2d2d", color: "#ebff6f" }}
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
                    style={{ background: "#0a0a0a", border: "1px solid #2d2d2d" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#ebff6f"; e.currentTarget.style.background = "#1f2410"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#2d2d2d"; e.currentTarget.style.background = "#1c1c1c"; }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: "#ebff6f25" }}
                    >
                      <Camera size={22} style={{ color: "#ebff6f" }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: "#fafafa" }}>Tomar selfie</span>
                    <span className="text-[11px]" style={{ color: "#fafafa" }}>Usar la cámara</span>
                  </button>

                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl transition-all"
                    style={{ background: "#0a0a0a", border: "1px solid #2d2d2d" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#ebff6f"; e.currentTarget.style.background = "#1f2410"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#2d2d2d"; e.currentTarget.style.background = "#1c1c1c"; }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: "#272b2d" }}
                    >
                      <ImageIcon size={22} style={{ color: "#ebff6f" }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: "#fafafa" }}>Desde galería</span>
                    <span className="text-[11px]" style={{ color: "#fafafa" }}>Elegir una foto</span>
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
                style={{ background: "#ebff6f", color: "#1c1c1c" }}
                onMouseEnter={e => { if (selfieFile) e.currentTarget.style.background = "#babe60"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#ebff6f"; }}
              >
                Buscar mis fotos
              </button>
            </div>

            <p className="text-[11px] text-center" style={{ color: "#fafafa" }}>
              Tip: usa una foto con buena luz, de frente y con tu cara despejada.
            </p>
          </div>
        )}

        {/* ── Matching ─────────────────────────────────────────── */}
        {step === "matching" && (
          <div className="text-center py-24">
            <div className="relative inline-block mb-6">
              <Loader size={52} className="animate-spin" style={{ color: "#ebff6f" }} />
              <Sparkles size={20} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: "#ebff6f" }} />
            </div>
            <p className="font-bold text-lg mb-1" style={{ color: "#fafafa" }}>Buscando tu cara...</p>
            <p className="text-sm" style={{ color: "#fafafa" }}>
              Analizando {totalPhotosInCohort} fotos
            </p>
          </div>
        )}

        {/* ── Resultados ───────────────────────────────────────── */}
        {step === "results" && (
          <div>
            <div
              className="rounded-2xl p-4 mb-6 flex items-center gap-3"
              style={{
                background: totalMatches > 0 ? "#14261c" : "#2a1517",
                border: `1px solid ${totalMatches > 0 ? "#258053" : "#942143"}`,
              }}
            >
              <button
                onClick={() => { setStep("upload"); setResultPhotos([]); clearSelection(); }}
                className="p-1.5 rounded-lg shrink-0"
                style={{ border: "1px solid #2d2d2d", color: "#ebff6f", background: "#0a0a0a" }}
              >
                <ArrowLeft size={14} />
              </button>
              <div>
                <h2 className="font-bold text-sm" style={{ color: "#fafafa" }}>
                  {totalMatches > 0
                    ? `¡Apareces en ${totalMatches} foto${totalMatches !== 1 ? "s" : ""}!`
                    : "No te encontramos"}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#fafafa" }}>
                  {totalMatches > 0
                    ? "Toca para seleccionar · descarga abajo"
                    : "Intenta con una foto más clara y de frente"}
                </p>
              </div>
            </div>

            {totalMatches > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {resultPhotos.map(filename => {
                    const isSelected = selected.has(filename);
                    return (
                      <div
                        key={filename}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleSelect(filename)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSelect(filename);
                          }
                        }}
                        aria-label={isSelected ? "Quitar de selección" : "Seleccionar foto"}
                        aria-pressed={isSelected}
                        className="relative rounded-xl overflow-hidden transition-all active:scale-[0.98] cursor-pointer"
                        style={{
                          border: isSelected ? "3px solid #ebff6f" : "1px solid #2d2d2d",
                        }}
                      >
                        <img
                          src={`${getCohortPhotoUrl(cohortId, filename)}?thumb=1`}
                          alt={filename}
                          className="w-full aspect-square object-cover"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          style={{ opacity: isSelected ? 0.88 : 1 }}
                        />
                        <div
                          className="absolute top-1.5 left-1.5 rounded-full flex items-center justify-center pointer-events-none transition-all"
                          style={{
                            width: 30, height: 30,
                            background: isSelected ? "#ebff6f" : "rgba(10,10,10,0.55)",
                            border: isSelected ? "2px solid #ebff6f" : "1.5px solid rgba(250,250,250,0.45)",
                            color: isSelected ? "#1c1c1c" : "transparent",
                          }}
                        >
                          {isSelected && <Check size={16} strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadingAll}
                  className="w-full flex items-center justify-center gap-2 font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
                  style={{ background: "#ebff6f", color: "#1c1c1c" }}
                  onMouseEnter={e => { if (!downloadingAll) e.currentTarget.style.background = "#babe60"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#ebff6f"; }}
                >
                  {downloadingAll
                    ? <><Loader size={16} className="animate-spin" /> Preparando ZIP…</>
                    : selected.size > 0
                      ? <><Download size={16} /> Descargar {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}</>
                      : <><Download size={16} /> Descargar todas mis fotos</>}
                </button>
                {selected.size > 0 && !downloadingAll && (
                  <button
                    onClick={clearSelection}
                    className="w-full mt-2 text-xs underline underline-offset-2"
                    style={{ color: "#a3a3a3" }}
                  >
                    Limpiar selección
                  </button>
                )}
              </>
            ) : (
              <div className="text-center py-10 rounded-2xl" style={{ border: "2px dashed #2d2d2d" }}>
                <ImageOff size={32} className="mx-auto mb-3" style={{ color: "#ebff6f" }} />
                <p className="text-sm mb-1" style={{ color: "#fafafa" }}>No encontramos tu cara en este cohort.</p>
                <p className="text-xs" style={{ color: "#fafafa" }}>
                  {usedWideSearch
                    ? "Prueba con una foto más clara, de frente y con buena iluminación."
                    : "Puede que la foto no sea suficientemente clara."}
                </p>

                <div className="mt-5 flex flex-col items-center gap-2">
                  {!usedWideSearch && (
                    <button
                      onClick={() => handleMatch(true)}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                      style={{ background: "#ebff6f20", border: "1px solid #ebff6f60", color: "#ebff6f" }}
                    >
                      Buscar con menor precisión
                    </button>
                  )}
                  <button
                    onClick={() => { setStep("upload"); resetSelfie(); setResultPhotos([]); setUsedWideSearch(false); }}
                    className="px-5 py-2.5 rounded-xl text-sm transition-colors"
                    style={{ border: "1px solid #2d2d2d", color: "#fafafa", background: "#0a0a0a" }}
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
