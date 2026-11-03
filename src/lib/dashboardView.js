// Which screen the dashboard is showing, as ONE value.
//
// This used to be eight separate booleans (showSetup, adding, showApps,
// showGhost, showStore, showPlatform, showAutomations, showCalendar) that every
// handler had to clear by hand. Forgetting one meant two screens "open" at
// once and a tab that looked dead. A single string cannot be in two states.
//
// Pure data and a reducer: no React, so scripts/check-discovery.mjs can test it.

/** Screens that are not "one of the business's data sections". */
export const MANAGE_VIEWS = ['store', 'tools', 'ghost', 'automations', 'calendar', 'platform']

/** 'section' means: show the active data section (activeKey in Dashboard). */
export const VIEWS = ['setup', 'section', 'add', ...MANAGE_VIEWS]

export const INITIAL_VIEW = 'setup'

/** The fixed tabs, in the order they are offered under "More". */
export const MANAGE_TABS = [
  { view: 'store', label: 'Store', icon: '🏪', hint: 'Add apps to your business' },
  { view: 'tools', label: 'Tools', icon: '🧩', hint: 'Connect Gmail, Square and more' },
  { view: 'ghost', label: 'My Ghost', icon: '👻', hint: 'Your box at the business' },
  { view: 'automations', label: 'Automations', icon: '⚡', hint: 'Workflows set up for you' },
  { view: 'calendar', label: 'Calendar', icon: '📅', hint: 'Booking calendars and iCal' },
  { view: 'platform', label: 'Platform', icon: '▣', hint: 'Your Paperclip companies' },
]

/** What the Setup guide's cards open. Unknown targets fall back to the section. */
const SETUP_TARGETS = {
  data: 'add',
  store: 'store',
  calendar: 'calendar',
  tools: 'tools',
  automations: 'automations',
  ghost: 'ghost',
}

export function viewForSetupTarget(target) {
  return SETUP_TARGETS[target] || 'section'
}

/**
 * Actions:
 *   { type: 'show', view }        open exactly that screen
 *   { type: 'section' }           back to the active data section
 *   { type: 'close', view }       leave `view`, but only if it is the open one
 *   { type: 'setup-target', target }
 *
 * Every action yields exactly one view, so "tapping Add from Calendar does
 * nothing" (an overlay flag left set) cannot happen.
 */
export function viewReducer(view, action) {
  switch (action?.type) {
    case 'show':
      return VIEWS.includes(action.view) ? action.view : view
    case 'section':
      return 'section'
    case 'close':
      return view === action.view ? 'section' : view
    case 'setup-target':
      return viewForSetupTarget(action.target)
    default:
      return view
  }
}
