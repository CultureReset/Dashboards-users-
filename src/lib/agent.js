/**
 * Talking to your own business.
 *
 * The owner opens the dashboard on their phone, presses the mic, and asks a
 * question about their own data. This is where that question goes.
 *
 * The order matters, and it is the one in the spec rather than the obvious one:
 *
 *   1. Is this already a stored fact? Answer from the cache. No model runs.
 *   2. If not, ask the box's model, with the cached data as context.
 *
 * Most of what an owner asks is step one. "What are my hours Sunday", "how
 * much is the grouper", "when's the next event" — those are lookups, and a
 * lookup is instant, exact, and costs nothing. Sending them to a model would
 * be slower, cost VRAM, and occasionally invent a price.
 *
 * Step two exists for everything else, and it gets the cached sections as
 * context so the model is answering from the business's real data rather than
 * from whatever it remembers about restaurants in general.
 *
 * Both steps run against data already on the device, so the first answer
 * arrives before the box has been contacted at all.
 */

// No cache import. The sections handed in are the ones the dashboard is
// rendering — reading from a second source is how an answer ends up
// disagreeing with the page it is sitting on top of.

/** Squash for comparison: lowercase, no punctuation, single spaces. */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Step one: answer from what is already here.
 *
 * Returns `{ answer, from, exact: true }` or null. Deliberately conservative —
 * it only fires on a clear match in a clearly shaped question. A wrong
 * confident answer is worse than handing the question to the model.
 */
export function answerFromCache(question, sections) {
  const q = norm(question)
  if (!q || !Array.isArray(sections)) return null

  const find = (name) => sections.find((s) => norm(s.table ?? s.name ?? s.section ?? '').includes(name))

  // ---- hours -------------------------------------------------------------
  if (/\b(hours?|open|close|closing|opening)\b/.test(q)) {
    const hours = find('hour')
    if (hours?.rows?.length) {
      const day = DAYS.find((d) => q.includes(d))
      const rows = day
        ? hours.rows.filter((r) => norm(JSON.stringify(r)).includes(day))
        : hours.rows
      if (rows.length) {
        return {
          answer: rows.map(describeHours).filter(Boolean).join('\n'),
          from: 'hours',
          exact: true,
        }
      }
    }
  }

  // ---- a price --------------------------------------------------------
  if (/\b(price|cost|how much|charge)\b/.test(q)) {
    const menu = find('menu') ?? find('item') ?? find('price')
    const rows = menu?.rows ?? []
    // Match on the longest item name that appears in the question, so
    // "shrimp po boy" beats "shrimp" when both are on the menu.
    const hit = rows
      .map((r) => ({ r, name: norm(r.item_name ?? r.name ?? '') }))
      .filter(({ name }) => name && q.includes(name))
      .sort((a, b) => b.name.length - a.name.length)[0]
    if (hit) {
      const price = hit.r.price ?? hit.r.amount
      if (price != null) {
        return {
          answer: `${hit.r.item_name ?? hit.r.name} — $${price}`,
          from: 'menu',
          exact: true,
        }
      }
    }
  }

  // ---- what's on -----------------------------------------------------
  if (/\b(event|happening|whats on|what is on|tonight|this week)\b/.test(q)) {
    const events = find('event')
    const rows = (events?.rows ?? []).slice(0, 5)
    if (rows.length) {
      return {
        answer: rows.map((r) => `${r.title ?? r.name ?? 'Event'}${r.starts_at ? ` — ${r.starts_at}` : ''}`).join('\n'),
        from: 'events',
        exact: true,
      }
    }
  }

  // ---- how many ------------------------------------------------------
  const count = /\bhow many (\w+)/.exec(q)
  if (count) {
    const s = find(count[1].replace(/s$/, ''))
    if (s?.rows) return { answer: `${s.rows.length}`, from: s.table ?? s.name, exact: true }
  }

  return null
}

function describeHours(row) {
  const day = row.day_of_week != null ? (DAYS[Number(row.day_of_week)] ?? '') : (row.day ?? '')
  const open = row.open_time ?? row.opens ?? row.start_time
  const close = row.close_time ?? row.closes ?? row.end_time
  if (!open && !close) return row.closed ? `${day}: closed` : null
  const label = day ? day[0].toUpperCase() + day.slice(1) : ''
  return `${label}${label ? ': ' : ''}${open ?? '?'} – ${close ?? '?'}`
}

/**
 * Step two: the box's model, given the business's own data.
 *
 * Only the sections that could bear on the question are sent. A whole
 * business — a year of events, four hundred menu items, every photo row —
 * does not fit in an 8K context, and stuffing it in pushes the question off
 * the front where the model never sees it.
 */
export async function askTheBox(question, sections, { baseUrl, key, model = 'v4', signal } = {}) {
  const context = relevantContext(question, sections)

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You answer questions about this one business, using only the data below. ' +
            'If the answer is not in it, say you do not have that rather than guessing — ' +
            'an invented price or an invented opening time does real damage.\n\n' +
            context,
        },
        { role: 'user', content: question },
      ],
    }),
  })

  if (!res.ok) throw new Error(`box said ${res.status}`)
  const data = await res.json()
  return {
    answer: data.choices?.[0]?.message?.content ?? '',
    from: 'model',
    exact: false,
  }
}

/** The sections worth sending, trimmed to fit. */
function relevantContext(question, sections, budget = 6000) {
  const q = norm(question)
  const scored = (sections ?? []).map((s) => {
    const name = norm(s.table ?? s.name ?? s.section ?? '')
    let score = 0
    for (const word of q.split(' ')) if (word.length > 3 && name.includes(word)) score += 5
    if (/hour|open|close/.test(q) && /hour/.test(name)) score += 10
    if (/price|cost|menu|eat|food|drink/.test(q) && /menu|item|price|drink/.test(name)) score += 10
    if (/event|tonight|happening/.test(q) && /event|special/.test(name)) score += 10
    if (/review|rating/.test(q) && /review/.test(name)) score += 10
    return { s, name, score }
  }).sort((a, b) => b.score - a.score)

  let out = ''
  for (const { s, name, score } of scored) {
    if (out.length > budget) break
    // Nothing scored: send the small sections so there is some grounding.
    if (score === 0 && out.length > budget / 2) break
    const rows = (s.rows ?? []).slice(0, 40)
    if (!rows.length) continue
    out += `## ${name}\n${JSON.stringify(rows).slice(0, 2500)}\n\n`
  }
  return out || 'No data cached for this business yet.'
}

/**
 * The whole thing: stored fact first, model second.
 *
 * `sections` is what the dashboard already has in state. `onInstant` fires the
 * moment a lookup answers it — before any request leaves the device.
 */
export async function ask(question, sections, { baseUrl, key, model, onInstant, signal } = {}) {
  const quick = answerFromCache(question, sections)
  if (quick) {
    if (onInstant) onInstant(quick)
    return quick
  }
  return askTheBox(question, sections, { baseUrl, key, model, signal })
}

/**
 * `sections` arrives from the dashboard as `{ table: rows }`. The lookups
 * above want `[{ table, rows }]`. Converted here rather than at each call site
 * so there is one place that knows the shape.
 */
export function asSections(tableRows) {
  return Object.entries(tableRows ?? {}).map(([table, rows]) => ({ table, rows }))
}
