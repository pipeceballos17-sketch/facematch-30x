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
export const getCohortEvents = (cohortId) => api.get(`/api/cohorts/${cohortId}/events`).then(r => r.data);

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

// ── Events & matching ──────────────────────────────────────────────
export const uploadEventFiles = (files, eventName, cohortId, onProgress) => {
  const fd = new FormData();
  const fileArray = Array.isArray(files) ? files : [files];
  fileArray.forEach(f => fd.append("files", f));
  if (eventName) fd.append("event_name", eventName);
  if (cohortId)  fd.append("cohort_id", cohortId);
  return api.post("/api/events/upload", fd, { onUploadProgress: onProgress }).then(r => r.data);
};
export const getEventStatus = (eventId) =>
  api.get(`/api/events/${eventId}/status`).then(r => r.data);
export const getEventResults = (eventId) =>
  api.get(`/api/events/${eventId}/results`).then(r => r.data);
export const listEvents = () => api.get("/api/events").then(r => r.data);

export const deleteEvent = (id) => api.delete(`/api/events/${id}`).then(r => r.data);

export const getDownloadUrl    = (eventId, participantId) =>
  `${api.defaults.baseURL}/api/events/${eventId}/download/${participantId}`;
export const getAllDownloadUrl  = (eventId) =>
  `${api.defaults.baseURL}/api/events/${eventId}/download-all`;
export const getManifestUrl    = (eventId) =>
  `${api.defaults.baseURL}/api/events/${eventId}/manifest`;

// ── Portal (public participant endpoints) ──────────────────────────
export const listPortalCohorts = () =>
  api.get("/api/portal/cohorts").then(r => r.data);

export const getCohortPortalInfo = (cohortId) =>
  api.get(`/api/cohorts/${cohortId}/portal-info`).then(r => r.data);

export const getEventInfo = (eventId) =>
  api.get(`/api/events/${eventId}/info`).then(r => r.data);

export const getEventPhotos = (eventId) =>
  api.get(`/api/events/${eventId}/photos`).then(r => r.data);

export const deleteEventPhoto = (eventId, filename) =>
  api.delete(`/api/events/${eventId}/photo/${encodeURIComponent(filename)}`).then(r => r.data);

export const matchSelfie = (eventId, file, threshold = null) => {
  const fd = new FormData();
  fd.append("file", file);
  if (threshold !== null) fd.append("threshold", threshold);
  return api.post(`/api/events/${eventId}/match-selfie`, fd).then(r => r.data);
};

export const matchSelfieInCohort = (cohortId, file, threshold = null) => {
  const fd = new FormData();
  fd.append("file", file);
  if (threshold !== null) fd.append("threshold", threshold);
  return api.post(`/api/cohorts/${cohortId}/match-selfie`, fd).then(r => r.data);
};

export const getEventPhotoUrl = (eventId, filename) =>
  `${api.defaults.baseURL}/api/events/${eventId}/photo/${encodeURIComponent(filename)}`;

export const downloadCohortSelection = (cohortId, selections) =>
  api.post(`/api/cohorts/${cohortId}/download-selection`, { selections }, {
    responseType: "blob",
  }).then(r => r.data);

export const addEventPhotos = (eventId, files) => {
  const fd = new FormData();
  files.forEach(f => fd.append("files", f));
  return api.post(`/api/events/${eventId}/add-photos`, fd).then(r => r.data);
};
