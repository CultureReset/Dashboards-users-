// A small QR code encoder: no dependency, no network, no canvas.
//
//   const modules = qrModules('https://example.test/x')   // boolean[][] or null
//   const d = qrPath(modules)                             // an SVG path string
//
// Byte mode, error correction M, versions 1-10 (up to 213 bytes at M), which is
// enough for the public link of any SDK app (an app id is at most 40
// characters and an install id is a UUID). Longer text returns null and the
// caller shows the link without a code. The algorithm follows ISO/IEC 18004:
// Reed-Solomon over GF(256) with 0x11D, the eight data masks scored with the
// four penalty rules, BCH-protected format and version information.
// scripts/check-sdkapp.mjs compares its output module for module against two
// independent encoders (when they are installed) and always checks the
// structure.

const ECC_M = 0 // format-info bits for level M

/** [data codewords, EC codewords per block, blocks of the short size, blocks of the long size] at level M, versions 1-10. */
const M_BLOCKS = [
  null,
  [16, 10, 1, 0], [28, 16, 1, 0], [44, 26, 1, 0], [64, 18, 2, 0], [86, 24, 2, 0],
  [108, 16, 4, 0], [124, 18, 4, 0], [154, 22, 2, 2], [182, 22, 3, 2], [216, 26, 4, 1],
]
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346]
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]
export const MAX_VERSION = 10

/* GF(256) */
const EXP = Array.from({ length: 512 })
const LOG = Array.from({ length: 256 })
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
}
const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

function generator(degree) {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = Array.from({ length: poly.length + 1 }, () => 0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gmul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly // highest power first, leading 1
}

function remainder(data, degree) {
  const gen = generator(degree)
  const rem = Array.from({ length: degree }, () => 0)
  for (const byte of data) {
    const factor = byte ^ rem.shift()
    rem.push(0)
    if (factor !== 0) for (let i = 0; i < degree; i++) rem[i] ^= gmul(gen[i + 1], factor)
  }
  return rem
}

function utf8(text) {
  return [...new TextEncoder().encode(text)]
}

/** The smallest version (<= 10) that holds `byteLength` bytes at level M, or 0. */
function pickVersion(byteLength) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    const countBits = v < 10 ? 8 : 16
    if (4 + countBits + byteLength * 8 <= M_BLOCKS[v][0] * 8) return v
  }
  return 0
}

function dataCodewords(bytes, version) {
  const capacityBits = M_BLOCKS[version][0] * 8
  const bits = []
  const push = (value, n) => { for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1) }
  push(0b0100, 4)
  push(bytes.length, version < 10 ? 8 : 16)
  for (const b of bytes) push(b, 8)
  push(0, Math.min(4, capacityBits - bits.length))
  while (bits.length % 8) bits.push(0)
  const out = []
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0xec; out.length < M_BLOCKS[version][0]; pad ^= 0xec ^ 0x11) out.push(pad)
  return out
}

function interleave(data, version) {
  const [total, ecLen, shortBlocks, longBlocks] = M_BLOCKS[version]
  const blocks = shortBlocks + longBlocks
  const shortLen = Math.floor(total / blocks)
  const dataBlocks = []
  let at = 0
  for (let i = 0; i < blocks; i++) {
    const len = shortLen + (i >= shortBlocks ? 1 : 0)
    dataBlocks.push(data.slice(at, at + len))
    at += len
  }
  const ecBlocks = dataBlocks.map((b) => remainder(b, ecLen))
  const out = []
  for (let i = 0; i < shortLen + 1; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i])
  for (let i = 0; i < ecLen; i++) for (const b of ecBlocks) out.push(b[i])
  return out
}

function bchFormat(data) {
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  return ((data << 10) | rem) ^ 0x5412
}

function bchVersion(version) {
  let rem = version
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
  return (version << 12) | rem
}

function maskBit(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0
    case 1: return r % 2 === 0
    case 2: return c % 3 === 0
    case 3: return (r + c) % 3 === 0
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}

function penalty(m) {
  const n = m.length
  let score = 0
  // runs of 5+ in rows and columns
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      let run = 1
      for (let j = 1; j < n; j++) {
        const a = pass ? m[j][i] : m[i][j]
        const b = pass ? m[j - 1][i] : m[i][j - 1]
        if (a === b) run++
        else { if (run >= 5) score += run - 2; run = 1 }
      }
      if (run >= 5) score += run - 2
    }
  }
  // 2x2 blocks
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c]
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3
    }
  }
  // finder-like 1:1:3:1:1 patterns with 4 light modules on a side
  const pat = [true, false, true, true, true, false, true]
  const at = (r, c, flip) => (flip ? m[c][r] : m[r][c])
  for (let flip = 0; flip < 2; flip++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c + 7 <= n; c++) {
        let hit = true
        for (let k = 0; k < 7 && hit; k++) if (at(r, c + k, flip) !== pat[k]) hit = false
        if (!hit) continue
        // the dark run on each end must be exactly one module long
        if ((c > 0 && at(r, c - 1, flip)) || (c + 7 < n && at(r, c + 7, flip))) continue
        const light = (from, to) => {
          for (let k = from; k < to; k++) {
            if (k < 0 || k >= n) continue
            if (at(r, k, flip)) return false
          }
          return true
        }
        if (light(c - 4, c)) score += 40
        if (light(c + 7, c + 11)) score += 40
      }
    }
  }
  // dark balance
  let dark = 0
  for (const row of m) for (const v of row) if (v) dark++
  const total = n * n
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
  return score
}

/**
 * @param {string} text
 * @param {{ mask?: number|null }} [opts] `mask` forces one of the eight masks (tests only)
 * @returns {boolean[][]|null} rows of dark(true)/light(false) modules, without a quiet zone; null if too long
 */
export function qrModules(text, { mask: forced = null } = {}) {
  const bytes = utf8(String(text ?? ''))
  const version = pickVersion(bytes.length)
  if (!version) return null
  const size = 17 + 4 * version
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const fn = Array.from({ length: size }, () => Array.from({ length: size }, () => false)) // function modules: never masked, never data
  const set = (r, c, dark) => { grid[r][c] = dark; fn[r][c] = true }

  // finders + separators
  for (const [fr, fc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = fr + dr
        const c = fc + dc
        if (r < 0 || c < 0 || r >= size || c >= size) continue
        const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3))
        set(r, c, dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && ring !== 2)
      }
    }
  }
  // timing
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  // alignment
  const pos = ALIGN[version]
  for (const r of pos) {
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
    }
  }
  // reserve format areas, dark module, version info
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, false); if (!fn[i][8]) set(i, 8, false) }
  for (let i = 0; i < 8; i++) { set(8, size - 1 - i, false); set(size - 1 - i, 8, false) }
  set(size - 8, 8, true)
  if (version >= 7) {
    const bits = bchVersion(version)
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, dark)
      set(b, a, dark)
    }
  }

  // data
  const codewords = interleave(dataCodewords(bytes, version), version)
  if (codewords.length !== TOTAL_CODEWORDS[version]) throw new Error('qr: codeword count mismatch')
  const bits = []
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1)
  let k = 0
  let up = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step++) {
      const r = up ? size - 1 - step : step
      for (let dc = 0; dc < 2; dc++) {
        const c = right - dc
        if (fn[r][c]) continue
        grid[r][c] = k < bits.length ? bits[k] === 1 : false
        k++
      }
    }
    up = !up
  }

  const withMask = (mask) => {
    const m = grid.map((row) => row.slice())
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!fn[r][c] && maskBit(mask, r, c)) m[r][c] = !m[r][c]
    const fmt = bchFormat((ECC_M << 3) | mask)
    const bit = (i) => ((fmt >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i)
    m[7][8] = bit(6)
    m[8][8] = bit(7)
    m[8][7] = bit(8)
    for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i)
    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i)
    for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i)
    m[size - 8][8] = true
    return m
  }

  let best = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    if (forced !== null && mask !== forced) continue
    const m = withMask(mask)
    const s = penalty(m)
    if (s < bestScore) { best = m; bestScore = s }
  }
  return best
}

/** One SVG path (`M x y h1 v1 h-1z` per dark module, merged per row run) for modules plus a quiet zone. */
export function qrPath(modules, quiet = 4) {
  if (!modules) return ''
  const parts = []
  for (let r = 0; r < modules.length; r++) {
    let c = 0
    while (c < modules.length) {
      if (!modules[r][c]) { c++; continue }
      let end = c
      while (end < modules.length && modules[r][end]) end++
      parts.push(`M${c + quiet} ${r + quiet}h${end - c}v1h-${end - c}z`)
      c = end
    }
  }
  return parts.join('')
}

/** Side length in modules including the quiet zone (for the SVG viewBox). */
export const qrSize = (modules, quiet = 4) => (modules ? modules.length + quiet * 2 : 0)
