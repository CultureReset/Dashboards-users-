import { api } from './apiClient'
import { endpoints } from './endpoints'

export const fetchSetupStatus = () => api.get(endpoints.setup.status())

export const connectListing = (payload) =>
  api.post(endpoints.setup.connect(), payload)

export const removeConnection = (id) => api.del(endpoints.setup.connectId(id))

/** 0-linked owners: request staff link. Does not write entity_owners. */
export const requestUnitLink = (payload) =>
  api.post(endpoints.setup.linkRequest(), payload)
