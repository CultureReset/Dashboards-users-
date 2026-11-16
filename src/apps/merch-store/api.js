import { api } from '../../lib/apiClient'

const PUBLIC = { auth: false }
const base = (slug) => `/api/apps/merch-store/${encodeURIComponent(slug)}`

export const merchStoreApi = {
  // Guest-facing: no sign-in, so no token is attached.
  catalog: (slug) => api.get(`${base(slug)}/catalog`, PUBLIC),
  placeOrder: (slug, body) => api.post(`${base(slug)}/orders`, body, PUBLIC),
  products: (slug) => api.get(`${base(slug)}/products`),
  createProduct: (slug, body) => api.post(`${base(slug)}/products`, body),
  updateProduct: (slug, id, body) => api.patch(`${base(slug)}/products/${encodeURIComponent(id)}`, body),
  deleteProduct: (slug, id) => api.del(`${base(slug)}/products/${encodeURIComponent(id)}`),
  orders: (slug) => api.get(`${base(slug)}/orders`),
  updateOrder: (slug, id, body) => api.patch(`${base(slug)}/orders/${encodeURIComponent(id)}`, body),
  settings: (slug) => api.get(`${base(slug)}/settings`),
  saveSettings: (slug, body) => api.patch(`${base(slug)}/settings`, body),
}
