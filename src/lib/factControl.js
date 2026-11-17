// Which control a fact question needs, from the registry's own storage column.
// Kept free of imports so scripts/check-discovery.mjs can load it under plain node.

/** Which control a question needs: 'choice' | 'yesno' | 'number' | 'text'. */
export function controlFor(question, registryFact) {
  const choices = question.choices?.length ? question.choices : registryFact?.choices || []
  if (choices.length) return 'choice'
  switch (registryFact?.index_column) {
    case 'v_bool': return 'yesno'
    case 'v_num': return 'number'
    default: return 'text'
  }
}
