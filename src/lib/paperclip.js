// Paperclip, from inside the existing business dashboard.
// Calls go to /api/paperclip on this site and are forwarded to PAPERCLIP_SERVER_URL.
// The Gulf Coast Radar calls are unchanged.

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function request(method, path, body) {
  const res = await fetch(`/api/paperclip${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return null
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new ApiError(typeof message === 'string' ? message : 'Request failed', res.status, data)
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
}

export const auth = {
  session: async () => {
    try {
      return await api.get('/auth/get-session')
    } catch (err) {
      if (err.status === 401) return null
      throw err
    }
  },
  signIn: (email, password) => api.post('/auth/sign-in/email', { email, password }),
}

export const businesses = {
  mine: () => api.get('/companies?scope=accessible'),
}

export const store = {
  list: (companyId) => api.get(`/companies/${companyId}/store`),
  menu: (companyId) => api.get(`/companies/${companyId}/menu`),
  install: (companyId, itemId) => api.post(`/companies/${companyId}/store/${itemId}/install`, {}),
  update: (companyId, itemId) => api.post(`/companies/${companyId}/store/${itemId}/update`, {}),
}
