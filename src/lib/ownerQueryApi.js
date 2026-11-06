import { api } from './apiClient'
import { endpoints } from './endpoints'

/** Catalog of queryable resources from industry_table_contract. */
export const fetchQueryCatalog = () => api.get(endpoints.query.catalog())

/**
 * Structured read. Shared v1 shape — retarget path when Admin commits /api/query.
 * Never send owner_context / business id; session scopes the slug.
 */
export const runOwnerQuery = (body) =>
  api.post(endpoints.query.run(), { version: 'v1', ...body })

/** Validated mutation with required audit reason. */
export const runOwnerMutation = ({ action, resource, table, id, values, reason }) =>
  api.post(endpoints.query.run(), {
    version: 'v1',
    action,
    resource,
    table,
    id,
    values,
    reason,
  })
