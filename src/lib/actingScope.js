// Which API calls carry the admin's acting-as ?slug=.
//
// An admin "viewing as" a business owns nothing, so the server has no slug to
// resolve for them. Every owner-scoped route needs it, not only /api/business:
// /api/store, /api/connections, /api/nodes and /api/owner are all behind
// ownerRequired, which reads ?slug= and checks it against platform_admins.
// Attaching it is never a grant: for anyone platform_admins does not vouch for,
// the server ignores it and uses the session's own business.
//
// `/api/business-auth/*` is deliberately NOT here: it is sign-in, not scoped.
const OWNER_SCOPED_PREFIXES = [
  '/api/business/',
  '/api/store',
  '/api/connections',
  '/api/nodes',
  '/api/owner',
]

// The App SDK's generic owner routes (/api/apps, /api/apps/<id>, and under it
// settings, resources, actions) are ownerRequired like the rest. They are
// matched narrowly, NOT as a '/api/apps' prefix: the two older route apps
// live at /api/apps/<app>/<business slug>, and a public SDK link is
// /api/apps/<id>/public/<install>; neither is touched.
const SDK_APP_OWNER_PATH = /^\/api\/apps(\/[^/?]+)?(\/(settings|resources|actions)(\/[^?]*)?)?(\?.*)?$/

export function isOwnerScoped(path) {
  const p = String(path || '')
  if (SDK_APP_OWNER_PATH.test(p)) return true
  return OWNER_SCOPED_PREFIXES.some((prefix) => {
    if (prefix.endsWith('/')) return p.startsWith(prefix)
    // '/api/store' must match '/api/store', '/api/store/x' and '/api/store?q',
    // but not '/api/storefront'.
    return p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}?`)
  })
}
