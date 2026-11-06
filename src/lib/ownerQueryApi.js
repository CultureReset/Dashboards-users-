import { api } from './apiClient'
import { endpoints } from './endpoints'

// Shared v1 contract (gcr-api-clean docs/UNIVERSAL_QUERY_CONTRACT.md), owner base /api/business/query.
// Never send owner_context / business_id; the session scopes the slug.
export const fetchQuerySchema = () => api.get(endpoints.query.schema())
export const runOwnerQuery = (body) => api.post(endpoints.query.run(), { version: 'v1', ...body })
/** mode: 'preview' | 'commit'. Owner commits return 503 writes_disabled until atomic audit ships. */
export const runOwnerMutation = ({ action, id, values, reason, mode, expected_version, idempotency_key }) =>
  api.post(endpoints.query.mutate(), {
    version: 'v1', action, mode, values, reason, expected_version, idempotency_key,
    ...(id ? { target: { id } } : {}),
  })
