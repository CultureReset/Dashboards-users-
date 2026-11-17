import { api } from '../../lib/apiClient'

const PUBLIC = { auth: false }
const base = (slug) => `/api/apps/song-request/${encodeURIComponent(slug)}`

export const songRequestApi = {
  // Guest-facing: no sign-in, so no token is attached.
  catalog: (slug) => api.get(`${base(slug)}/catalog`, PUBLIC),
  createRequest: (slug, body) => api.post(`${base(slug)}/request`, body, PUBLIC),
  queue: (slug) => api.get(`${base(slug)}/queue`),
  settings: (slug) => api.get(`${base(slug)}/settings`),
  saveSettings: (slug, body) => api.patch(`${base(slug)}/settings`, body),
  songs: (slug) => api.get(`${base(slug)}/songs`),
  saveSongs: (slug, songs) => api.put(`${base(slug)}/songs`, { songs }),
  setStatus: (slug, id, status) => api.patch(`${base(slug)}/queue/${encodeURIComponent(id)}`, { status }),
}
