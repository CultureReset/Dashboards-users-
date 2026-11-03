import { useId } from 'react'
import { permissionSummary } from './validate'

/** What the app reads, writes and sends, in plain words, and what the owner has allowed. */
export default function PermissionsSummary({ app }) {
  const uid = useId().replace(/:/g, '')
  const s = permissionSummary(app)
  const groups = [
    ['Reads', s.reads],
    ['Writes', s.writes],
    ['Sends', s.sends],
    ['Customers can', s.visitors],
  ].filter(([, items]) => items.length)
  return (
    <section className="sa-card" aria-labelledby={`sa-perm-${uid}`} id="sa-permissions">
      <h2 id={`sa-perm-${uid}`} className="sa-h2" tabIndex={-1}>What this app can do</h2>
      {groups.length === 0 && s.asked.length === 0 ? (
        <p className="sa-muted">{app.name} keeps no information and sends nothing. It asks for no permissions.</p>
      ) : (
        <>
          <dl className="sa-perms">
            {groups.map(([label, items]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd><ul>{items.map((t) => <li key={t}>{t}</li>)}</ul></dd>
              </div>
            ))}
          </dl>
          {s.asked.length > 0 && (
            <>
              <h3 className="sa-h3">Permissions you were asked about</h3>
              <ul className="sa-asked">
                {s.asked.map((p) => (
                  <li key={p.id}>
                    <span>{p.text}</span>
                    <span className="sa-chip" data-state={p.granted === true ? 'yes' : p.granted === false ? 'no' : 'maybe'}>
                      {p.granted === true ? 'Allowed' : p.granted === false ? 'Not allowed' : 'Asked for'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <p className="sa-muted sa-small">You can remove the app any time from the Store. Your information is kept in case you bring it back.</p>
    </section>
  )
}
