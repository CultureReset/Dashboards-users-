import { api } from './apiClient'
import { endpoints } from './endpoints'
import { sortPhotos, describePhotoError } from './photoUpload'

// Every photo call. None of them sends a slug, in the path, query or body of
// its own: gcr-api-clean takes the business from the session. (apiClient adds
// the acting slug for an admin's "View as", the one case the server allows.)

const TABLE = 'entity_photos'
const UPLOAD_TIMEOUT_MS = 120000 // a 10 MB photo on a phone connection is not a 30 second job

export async function listPhotos() {
  try {
    const { rows = [] } = await api.get(endpoints.business.table(TABLE), { query: { limit: 200 } })
    return sortPhotos(rows)
  } catch (error) {
    throw new Error(describePhotoError(error, 'Could not load your photos.'))
  }
}

/** Send one file. Resolves to the new photo row. */
export async function uploadPhoto(file) {
  const form = new FormData()
  form.append('image', file, file.name)
  try {
    const { photo } = await api.upload(endpoints.business.photoUpload(), form, { timeoutMs: UPLOAD_TIMEOUT_MS })
    return photo
  } catch (error) {
    throw new Error(describePhotoError(error))
  }
}

export async function addPhotoByUrl(url, sortOrder = 0) {
  try {
    const { row } = await api.post(endpoints.business.create(TABLE), { url, sort_order: sortOrder })
    return row
  } catch (error) {
    throw new Error(describePhotoError(error, 'Could not add that photo.'))
  }
}

export async function setCoverPhoto(id) {
  try {
    return await api.post(endpoints.business.photoCover(id))
  } catch (error) {
    throw new Error(describePhotoError(error, 'Could not change the cover photo.'))
  }
}

export async function saveCaption(id, caption) {
  try {
    const { row } = await api.patch(endpoints.business.update(TABLE, id), { caption })
    return row
  } catch (error) {
    throw new Error(describePhotoError(error, 'Could not save that caption.'))
  }
}

export async function deletePhoto(id) {
  try {
    await api.del(endpoints.business.remove(TABLE, id))
  } catch (error) {
    throw new Error(describePhotoError(error, 'Could not delete that photo.'))
  }
}
