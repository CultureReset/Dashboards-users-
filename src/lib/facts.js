import { api } from './apiClient'
import { endpoints } from './endpoints'
import { controlFor } from './factControl.js'

// Fact answers: the questions guests ask that the business has not answered.
//
// The API owns the list (GET /api/business/facts/questions — only what is still
// unknown for the signed-in business) and the vocabulary (GET /api/facts — each
// fact's storage column and, for choices, its allowed values). Nothing here
// names a fact. The input for a question is chosen from the registry's storage
// column, so a fact added to the registry tomorrow gets the right control.

export async function fetchFactQuestions() {
  const [{ questions = [] }, registry] = await Promise.all([
    api.get(endpoints.facts.questions()),
    // The registry only refines the input type. If it is unreachable the
    // questions still load and fall back to a plain text box.
    api.get(endpoints.facts.registry(), { auth: false }).catch(() => ({ facts: [] })),
  ])
  const byKey = Object.fromEntries((registry.facts || []).map((f) => [f.key, f]))
  return questions.map((q) => ({ ...q, control: controlFor(q, byKey[q.fact]), choices: q.choices?.length ? q.choices : byKey[q.fact]?.choices || [] }))
}

/**
 * Save answers. `answers` is [{ fact, value } | { fact, maybe: true } | { fact, unknown: true }].
 * Resolves { saved }. A 400 carries `errors: [..]` which are joined into one message.
 */
export async function saveFactAnswers(answers) {
  try {
    return await api.post(endpoints.facts.answers(), { answers })
  } catch (error) {
    const list = error?.body?.errors
    if (Array.isArray(list) && list.length) error.message = list.join(' ')
    throw error
  }
}
