import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

// Attach stored admin key to every request
api.interceptors.request.use(config => {
  const key = localStorage.getItem("adminKey");
  if (key) config.headers["x-admin-key"] = key;
  return config;
});

// On 401 → clear key and notify App to show lock screen
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem("adminKey");
      window.dispatchEvent(new CustomEvent("admin-logout"));
    }
    return Promise.reject(err);
  }
);

// ── Cohorts ────────────────────────────────────────────────────────
export const listCohorts = () => api.get("/api/cohorts").then(r => r.data);
export const createCohort = (formData) => api.post("/api/cohorts", formData).then(r => r.data);
export const deleteCohort = (id) => api.delete(`/api/cohorts/${id}`).then(r => r.data);

// Cohort photo pool (the new model — everything lives here)
export const listCohortPhotos = (cohortId) =>
  api.get(`/api/cohorts/${cohortId}/photos`).then(r => r.data);

export const uploadCohortPhotos = (cohortId, files, onProgress) => {
  const fd = new FormData();
  (Array.isArray(files) ? files : [files]).forEach(f => fd.append("files", f));
  return api.post(`/api/cohorts/${cohortId}/photos`, fd, {
    onUploadProgress: onProgress,
    // Cap each batch at 5min so a stuck request doesn't freeze the worker pool.
    timeout: 5 * 60 * 1000,
  }).then(r => r.data);
};

export const deleteCohortPhoto = (cohortId, filename) =>
  api.delete(`/api/cohorts/${cohortId}/photo/${encodeURIComponent(filename)}`).then(r => r.data);

export const getCohortPhotoUrl = (cohortId, filename) =>
  `${api.defaults.baseURL}/api/cohorts/${cohortId}/photo/${encodeURIComponent(filename)}`;

// ── Participants ───────────────────────────────────────────────────
export const getParticipants = () => api.get("/api/participants").then(r => r.data);
export const createParticipant = (formData) => api.post("/api/participants", formData).then(r => r.data);
export const deleteParticipant = (id) => api.delete(`/api/participants/${id}`).then(r => r.data);
export const uploadReferencePhoto = (id, file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post(`/api/participants/${id}/photo`, fd).then(r => r.data);
};
export const fetchLinkedInPhoto = (id, linkedinUrl) => {
  const fd = new FormData();
  fd.append("linkedin_url", linkedinUrl);
  return api.post(`/api/participants/${id}/linkedin-photo`, fd).then(r => r.data);
};
export const getParticipantPhotoUrl = (id) =>
  `${api.defaults.baseURL}/api/participants/${id}/photo`;

// ── LinkedIn search ────────────────────────────────────────────────
export const searchLinkedIn = (name, company) =>
  api.get("/api/linkedin/search", { params: { name, company } }).then(r => r.data);

// ── CSV Import ─────────────────────────────────────────────────────
export const importParticipantsCSV = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/api/participants/import-csv", fd).then(r => r.data);
};
export const getCSVImportStatus = (importId) =>
  api.get(`/api/participants/import-csv/${importId}`).then(r => r.data);
export const csvTemplateUrl = () =>
  `${api.defaults.baseURL}/api/participants/csv-template`;

// ── Portal (public participant endpoints) ──────────────────────────
export const listPortalCohorts = () =>
  api.get("/api/portal/cohorts").then(r => r.data);

export const getCohortPortalInfo = (cohortId) =>
  api.get(`/api/cohorts/${cohortId}/portal-info`).then(r => r.data);

export const matchSelfieInCohort = (cohortId, file, threshold = null) => {
  const fd = new FormData();
  fd.append("file", file);
  if (threshold !== null) fd.append("threshold", threshold);
  return api.post(`/api/cohorts/${cohortId}/match-selfie`, fd).then(r => r.data);
};

export const downloadCohortSelection = (cohortId, selections) =>
  api.post(`/api/cohorts/${cohortId}/download-selection`, { selections }, {
    responseType: "blob",
  }).then(r => r.data);

// Two-step ZIP for iOS-friendly downloads. Backend builds the ZIP to disk
// and returns a token; frontend then GETs by URL (Content-Disposition:
// attachment), so iPhone shows its native download/share sheet.
export const prepareCohortZip = (cohortId, selections) =>
  api.post(`/api/cohorts/${cohortId}/zip-prepare`, { selections }, {
    timeout: 5 * 60 * 1000,
  }).then(r => r.data);

export const cohortZipUrl = (cohortId, token) =>
  `${api.defaults.baseURL}/api/cohorts/${cohortId}/zip-download/${token}`;
