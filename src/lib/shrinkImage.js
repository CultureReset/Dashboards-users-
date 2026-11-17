import { MSG, SHRINK_AT, fitWithin, needsShrink, nextQuality, jpegName } from './photoUpload'

// Browser half of the upload preparation. The decisions (when to shrink, the
// sizes, the quality steps) are pure and live in photoUpload.js; this only
// decodes, draws and encodes.
//
// A phone photo is often 3-10 MB, over the host's request-body cap, so it is
// resized to 2560 px on the long side and saved as JPEG, stepping the quality
// down until it fits. EXIF rotation is applied by the decode, so a portrait
// photo stays upright once the metadata is gone.

const toBlob = (canvas, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))

/**
 * The File to send for a chosen one: the original when it is already small
 * enough, otherwise a smaller JPEG. Throws Error(MSG.type) when the browser
 * cannot decode it (a HEIC, a renamed file, a broken one).
 */
export async function prepareForUpload(file) {
  if (String(file.type).toLowerCase() === 'image/gif') return file // never re-encoded; size checked up front

  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(MSG.type)
  }

  try {
    if (!needsShrink({ type: file.type, size: file.size, width: bitmap.width, height: bitmap.height })) return file

    let { width, height } = fitWithin(bitmap.width, bitmap.height)
    // A very detailed picture can stay over the limit even at the lowest
    // quality, so after the last step try again a little smaller.
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff' // JPEG has no transparency
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bitmap, 0, 0, width, height)

      for (let q = nextQuality(null); q !== null; q = nextQuality(q)) {
        const blob = await toBlob(canvas, q)
        if (!blob) throw new Error(MSG.type)
        if (blob.size <= SHRINK_AT) return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() })
      }
      width = Math.max(1, Math.round(width * 0.8))
      height = Math.max(1, Math.round(height * 0.8))
    }
    throw new Error(MSG.serverTooBig)
  } finally {
    bitmap.close?.()
  }
}
