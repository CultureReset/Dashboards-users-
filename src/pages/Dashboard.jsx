import { useEffect, useMemo, useReducer, useRef, useState, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { fetchEntity } from '../lib/gcrApi'
import { fetchEntityTables, getColumns } from '../lib/schemaDiscovery'
import { fetchTablesForSlug, readTableCache } from '../lib/entityTables'
import { discoverSections, mergeEntitySources } from '../lib/discoverSections'
import {
  sectionsFromEnabledModules,
  mergeModuleAndDiscoveredSections,
  polishOwnerSections,
} from '../lib/moduleNav'
import { fetchOwnerModules } from '../lib/modulesApi'
import { TABLE_TO_API_KEY, tableFor } from '../lib/tableMap'
import { rendererFor } from '../sections/registry'
import GenericSection from '../sections/GenericSection'
import EditableSection from '../sections/EditableSection'
import EmptyModulePanel from '../components/EmptyModulePanel'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import MainContent from '../components/MainContent'
import AddSection from '../components/AddSection'
import AppStore from './AppStore'
import Ghost from './Ghost'
import Store from './Store'
import { SongRequestOwnerSettings } from '../apps/song-request'
import { MerchStoreOwnerSettings } from '../apps/merch-store'
import Automations from './Automations'
import Platform from './Platform'
import Calendar from './Calendar'
import Setup from './Setup'
import { fetchAutomations } from '../lib/automations'
import { INITIAL_VIEW, viewReducer } from '../lib/dashboardView'
import { useToast } from '../components/Toast'
import ErrorBoundary from '../components/ErrorBoundary'

export default function Dashboard() {
  const { gcrSlug } = useAuth()
  const [entity, setEntity] = useState(null)
  const [tableRows, setTableRows] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sweep, setSweep] = useState(null) // { done, total } while scanning
  const [activeKey, setActiveKey] = useState(null)
  const [reloadKey, setReloadKey] = useState(0) // bumped after an edit saves
  const [modulesReloadKey, setModulesReloadKey] = useState(0)
  const [allTables, setAllTables] = useState([]) // every slug table in the schema
  // Which screen is open. One value, not eight booleans — see dashboardView.js.
  const [view, dispatchView] = useReducer(viewReducer, INITIAL_VIEW)
  const toast = useToast()
  // What has been loaded for the current business. After the first load,
  // reloads are silent: the shell stays mounted, scroll and tab stay put.
  const entityLoadedFor = useRef(null)
  const sweptFor = useRef(null)
  const tablesRef = useRef([])
  const [automationsCount, setAutomationsCount] = useState(0)
  const [ownerModules, setOwnerModules] = useState([])
  const [ownerVisibleTables, setOwnerVisibleTables] = useState(null)
  const [modulesApiAvailable, setModulesApiAvailable] = useState(false)

  const refreshAll = useCallback(() => {
    setReloadKey((k) => k + 1)
    setModulesReloadKey((k) => k + 1)
  }, [])
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // The API payload — richest source for the domains it covers.
  useEffect(() => {
    let cancelled = false
    // Only the first load of a business blanks the screen. A reload after a
    // save keeps showing what is there and swaps the data in when it arrives.
    const silent = entityLoadedFor.current === gcrSlug
    if (!silent) {
      setLoading(true)
      setError('')
    }
    fetchEntity(gcrSlug)
      .then((data) => {
        if (cancelled) return
        entityLoadedFor.current = gcrSlug
        setEntity(data)
        setError('')
      })
      .catch((err) => {
        if (cancelled) return
        if (silent) toast.error(`Couldn't refresh your data: ${err.message}`)
        else setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcrSlug, reloadKey])

  // Owner modules — GET /api/owner/modules (gcr-api-clean PR #80).
  // Session slug only; soft-fail to discovery when the endpoint is not deployed.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await fetchOwnerModules()
      if (cancelled) return
      setModulesApiAvailable(!!result.available)
      setOwnerModules(result.modules || [])
      setOwnerVisibleTables(result.ownerVisibleTables ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [gcrSlug, modulesReloadKey])

  // Ask the database what tables exist right now, then sweep them for this
  // slug. The schema is re-read every load, so the dashboard follows the
  // database: new tables show up, dropped tables go away, column changes flow
  // through. Cached results only paint instantly while the fresh read runs.
  useEffect(() => {
    let cancelled = false
    // A reload after the first sweep is silent: no cached repaint (it would
    // flash the pre-save rows), no progress bar, and the schema is not re-read
    // — saving a row does not change which tables exist.
    const silent = sweptFor.current === gcrSlug

    const cached = silent ? null : readTableCache(gcrSlug)
    if (cached) setTableRows(cached)

    ;(async () => {
      try {
        const tables = silent && tablesRef.current.length ? tablesRef.current : await fetchEntityTables()
        tablesRef.current = tables
        if (cancelled) return
        // Kept whole, not just the ones with rows — this is what the business
        // gets offered when they want to add something they don't have yet.
        setAllTables(tables)
        if (!cached && !silent) setSweep({ done: 0, total: tables.length })

        const fresh = await fetchTablesForSlug(gcrSlug, tables, silent ? {} : {
          // Stream sections in as they land so the page fills progressively…
          onFound: (table, rows) => {
            if (!cancelled) setTableRows((prev) => ({ ...prev, [table]: rows }))
          },
          onProgress: (done, total) => {
            if (!cancelled && !cached) setSweep({ done, total })
          },
        })

        // …then replace wholesale, which is what drops tables that no longer
        // exist or no longer have data for this business.
        if (!cancelled) {
          sweptFor.current = gcrSlug
          setTableRows(fresh)
        }
      } catch (err) {
        // Discovery is additive — if it fails the API-backed sections still
        // work. After a save, though, stale rows would look like the save
        // was lost, so say so.
        if (silent && !cancelled) toast.error(`Couldn't refresh your sections: ${err.message}`)
      } finally {
        if (!cancelled) setSweep(null)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcrSlug, reloadKey])

  // How many automations the operator has pushed here, for the tab badge.
  // Failure is silent: the tab still opens, and the page explains itself.
  useEffect(() => {
    let cancelled = false
    fetchAutomations()
      .then((data) => { if (!cancelled) setAutomationsCount((data.automations || []).length) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [gcrSlug, reloadKey])

  const merged = useMemo(
    () => mergeEntitySources(entity, tableRows),
    [entity, tableRows]
  )

  // Data-discovered sections (existing behavior). Always kept.
  const discovered = useMemo(() => discoverSections(merged), [merged])

  // When the modules API is available, union enabled modules (with empty
  // stubs) onto discovery. When it is not, behave exactly as before.
  const sections = useMemo(() => {
    let next
    if (!modulesApiAvailable) {
      next = discovered
    } else {
      const fromModules = sectionsFromEnabledModules(ownerModules, merged)
      next = mergeModuleAndDiscoveredSections(discovered, fromModules)
    }
    return polishOwnerSections(next, {
      ownerVisibleTables: modulesApiAvailable ? ownerVisibleTables : null,
      tableFor,
    })
  }, [discovered, ownerModules, merged, modulesApiAvailable, ownerVisibleTables])

  useEffect(() => {
    if (sections.length && !sections.some((s) => s.key === activeKey)) {
      setActiveKey(sections[0].key)
    }
  }, [sections, activeKey])

  if (loading) {
    return (
      <div className="dashboard-loading" role="status" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <span>Loading your business…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-loading">
        <span className="auth-error" role="alert">Couldn't load your business: {error}</span>
        <button
          type="button"
          className="primary"
          onClick={() => {
            // A failed first load has no data to keep, so this one is allowed
            // to show the spinner again.
            setError('')
            setLoading(true)
            reload()
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  const active = sections.find((s) => s.key === activeKey)
  // Columns for the table behind this section, so the renderer can be chosen
  // from its shape rather than from its name.
  const activeColumns = active ? getColumns(tableFor(active.key) || active.key) : []
  const Custom = rendererFor(active, activeColumns)

  const onSection = view === 'section'
  // The tab that shows as selected: only a data section can be.
  const shownKey = onSection ? activeKey : null
  const pickSection = (key) => {
    setActiveKey(key)
    dispatchView({ type: 'section' })
  }
  const openAdd = () => dispatchView({ type: 'show', view: 'add' })

  return (
    <div className="dashboard-shell">
      <TopBar
        businessName={entity?.name}
        sections={sections}
        activeKey={shownKey}
        onSelect={pickSection}
      />
      {sweep && (
        <div className="sweep-status" role="status" aria-live="polite">
          Checking your data… {sweep.done}/{sweep.total}
        </div>
      )}
      <MainContent empty={onSection && sections.length === 0} onAdd={openAdd}>
        <ErrorBoundary inline resetKey={`${view}:${activeKey}`}>
        {view === 'setup' ? (
          <Setup entity={entity} onOpen={(target) => dispatchView({ type: 'setup-target', target })} />
        ) : view === 'calendar' ? (
          <Calendar />
        ) : view === 'platform' ? (
          <Platform />
        ) : view === 'store' ? (
          <Store onChanged={refreshAll} />
        ) : view === 'ghost' ? (
          <Ghost />
        ) : view === 'automations' ? (
          <Automations onCountChange={setAutomationsCount} />
        ) : view === 'tools' ? (
          <AppStore />
        ) : view === 'section' && (activeKey === 'song-request' || activeKey === 'song_request') ? (
          <SongRequestOwnerSettings slug={gcrSlug} />
        ) : view === 'section' && (activeKey === 'merch-store' || activeKey === 'merch_store' || activeKey === 'shop') ? (
          <MerchStoreOwnerSettings slug={gcrSlug} />
        ) : view === 'add' ? (
          <AddSection
            industry={entity?.entity_type}
            allTables={allTables}
            activeKeys={sections.map((s) => s.key)}
            onCancel={() => dispatchView({ type: 'close', view: 'add' })}
            onDone={(table) => {
              dispatchView({ type: 'close', view: 'add' })
              // The new row makes this table a section on the next pass.
              setActiveKey(TABLE_TO_API_KEY[table] || table)
              refreshAll()
            }}
          />
        ) : active?.empty ? (
          <EmptyModulePanel section={active} onAdd={openAdd} />
        ) : (
          active && (
            <EditableSection
              key={active.key}
              section={active}
              onChanged={reload}
            >
              {Custom ? (
                <Custom entity={merged} section={active} columns={activeColumns} />
              ) : (
                <GenericSection entity={merged} section={active} />
              )}
            </EditableSection>
          )
        )}
        </ErrorBoundary>
      </MainContent>
      <BottomNav
        sections={sections}
        view={view}
        activeKey={activeKey}
        onSelect={pickSection}
        onShow={(next) => dispatchView({ type: 'show', view: next })}
        automationsCount={automationsCount}
      />
    </div>
  )
}
