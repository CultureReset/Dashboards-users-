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

// `fetchImpl` is optional and only for tests and the Ask box (src/ask): it lets
// a caller hand in its own fetch. Left out, the global fetch is used, exactly as before.
async function request(method, path, body, fetchImpl = fetch) {
  const res = await fetchImpl(`/api/paperclip${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return null
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new ApiError('Platform returned an invalid response. Check the Paperclip API connection.', res.ok ? 502 : res.status, null)
  }
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new ApiError(typeof message === 'string' ? message : 'Request failed', res.status, data)
  }
  return data
}

export const api = {
  get: (path, fetchImpl) => request('GET', path, undefined, fetchImpl),
  post: (path, body = {}, fetchImpl) => request('POST', path, body, fetchImpl),
  patch: (path, body = {}, fetchImpl) => request('PATCH', path, body, fetchImpl),
  del: (path, fetchImpl) => request('DELETE', path, undefined, fetchImpl),
}

export const auth = {
  session: async (fetchImpl) => {
    try {
      return await api.get('/auth/get-session', fetchImpl)
    } catch (err) {
      if (err.status === 401) return null
      throw err
    }
  },
  signIn: (email, password) => api.post('/auth/sign-in/email', { email, password }),
}

export const businesses = {
  mine: (fetchImpl) => api.get('/companies?scope=accessible', fetchImpl),
}

export const store = {
  list: (companyId) => api.get(`/companies/${companyId}/store`),
  menu: (companyId) => api.get(`/companies/${companyId}/menu`),
  install: (companyId, itemId) => api.post(`/companies/${companyId}/store/${itemId}/install`, {}),
  update: (companyId, itemId) => api.post(`/companies/${companyId}/store/${itemId}/update`, {}),
}
