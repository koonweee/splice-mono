import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/charts/styles.css'
import '@mantine/notifications/styles.css'
import 'mantine-react-table/styles.css'
import '../src/styles.css'
import './workbench.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { MantineProvider, Stack, Text } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import {
  ACCENT_SWATCHES,
  resolveAppearance,
} from '../src/lib/design-system/appearance'
import { AppThemeProvider } from '../src/components/AppThemeProvider'
import { validateSettingsSearch } from '../src/lib/route-search'
import { FixturePresentation } from './runtime-boundaries'
import { appearanceFromSearch, settingsSections } from './preferences'
import { examples } from './examples'
import { installNetworkIsolation } from './isolation'

const restoreIsolation = installNetworkIsolation(window)
const reportBlockedRequest = (event: Event) => {
  const banner = document.createElement('div')
  banner.setAttribute('role', 'alert')
  banner.textContent = (event as CustomEvent<string>).detail
  document.body.prepend(banner)
}
window.addEventListener('workbench:request-blocked', reportBlockedRequest)

const params = new URLSearchParams(location.search)
const initialAppearance = appearanceFromSearch(location.search)
const modes = ['light', 'dark', 'oled']
const pageIds = [
  'page-home',
  'page-accounts',
  'page-transactions',
  'page-analysis',
  'page-settings',
]
const reduced = params.get('motion') === 'reduce'
if (reduced) {
  const match = window.matchMedia.bind(window)
  window.matchMedia = (query) =>
    match(query.includes('prefers-reduced-motion') ? 'all' : query)
  document.documentElement.dataset.workbenchMotion = 'reduce'
}

function Preview() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  )
  const preset = initialAppearance
  const example =
    examples.find((entry) => entry.id === params.get('example')) ?? examples[0]
  const Component = example.component
  return (
    <AppThemeProvider initialAppearance={preset.preference} authenticated>
      <QueryClientProvider client={queryClient}>
        <Notifications />
        <FixturePresentation masked={params.get('masked') === 'true'}>
          <div
            className={
              example.id.startsWith('page-') || example.id === 'launch-screen'
                ? 'wb-page-preview'
                : 'wb-preview'
            }
          >
            <Component
              state={params.get('state') ?? example.states[0]}
              masked={params.get('masked') === 'true'}
            />
          </div>
        </FixturePresentation>
      </QueryClientProvider>
    </AppThemeProvider>
  )
}

function Workbench() {
  const [allPages, setAllPages] = useState(params.get('view') === 'pages')
  const [search, setSearch] = useState('')
  const [exampleId, setExample] = useState(params.get('example') ?? 'controls')
  const [tab, setTab] = useState<string>(
    validateSettingsSearch({ tab: params.get('tab') }).tab ?? 'general',
  )
  const [mode, setMode] = useState<string>(initialAppearance.preference.mode)
  const [accent, setAccent] = useState(
    initialAppearance.preference.accent ?? 'neutral',
  )
  const [custom, setCustom] = useState(
    initialAppearance.preference.accent ?? '#83b59b',
  )
  const [state, setState] = useState(params.get('state') ?? 'ready')
  const [width, setWidth] = useState(params.get('width') ?? '390')
  const [masked, setMasked] = useState(params.get('masked') === 'true')
  const [monospace, setMonospace] = useState(params.get('monospace') === 'true')
  const [motion, setMotion] = useState(reduced)
  const [latency, setLatency] = useState(params.get('latency') ?? '0')
  const [failure, setFailure] = useState(params.get('failure') ?? 'none')
  const [compare, setCompare] = useState(params.get('compare') === 'true')
  const example =
    examples.find((entry) => entry.id === exampleId) ?? examples[0]
  const next = new URLSearchParams({
    view: allPages ? 'pages' : 'component',
    example: example.id,
    tab,
    mode,
    accent,
    state,
    width,
    masked: String(masked),
    monospace: String(monospace),
    motion: motion ? 'reduce' : 'normal',
    compare: String(compare),
    latency,
    failure,
  })
  history.replaceState(null, '', `?${next}`)
  const frame = (id: string, entry = example) => {
    const query = new URLSearchParams(next)
    query.set('frame', 'true')
    query.set('mode', id)
    query.set('example', entry.id)
    query.set('state', entry.states.includes(state) ? state : entry.states[0])
    return (
      <section key={`${entry.id}-${id}`}>
        <h2>{allPages ? entry.title : id}</h2>
        <iframe
          title={`${entry.title} — ${id}`}
          src={`?${query}`}
          style={{ width: Number(width) }}
        />
      </section>
    )
  }
  return (
    <div className="wb-shell">
      <header>
        <h1>Splice workbench</h1>
        <p>
          Production components · local fixtures · Light / Dark / OLED + accent
        </p>
      </header>
      <div className="wb-controls">
        <label>
          View
          <select
            value={allPages ? 'pages' : 'component'}
            onChange={(event) => setAllPages(event.target.value === 'pages')}
          >
            <option value="component">Component example</option>
            <option value="pages">All pages side by side</option>
          </select>
        </label>
        <label>
          Search components
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          Example
          <select
            value={example.id}
            onChange={(event) => {
              setExample(event.target.value)
              setState(
                examples.find((entry) => entry.id === event.target.value)
                  ?.states[0] ?? 'ready',
              )
            }}
          >
            {examples
              .filter((entry) =>
                `${entry.title} ${entry.components.join(' ')}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
          </select>
        </label>
        {(allPages || example.id === 'page-settings') && (
          <label>
            Settings section
            <select
              value={tab}
              onChange={(event) => setTab(event.target.value)}
            >
              {settingsSections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Mode
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            {modes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Accent
          <select
            value={
              ACCENT_SWATCHES.some(
                (swatch) => (swatch.value ?? 'neutral') === accent,
              )
                ? accent
                : 'custom'
            }
            onChange={(event) =>
              setAccent(
                event.target.value === 'custom' ? custom : event.target.value,
              )
            }
          >
            {ACCENT_SWATCHES.map((swatch) => (
              <option key={swatch.label} value={swatch.value ?? 'neutral'}>
                {swatch.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>
          Custom hex
          <input
            value={custom}
            pattern="#[0-9a-fA-F]{6}"
            aria-invalid={!/^#[0-9a-f]{6}$/i.test(custom)}
            onChange={(event) => {
              setCustom(event.target.value)
              if (/^#[0-9a-f]{6}$/i.test(event.target.value))
                setAccent(event.target.value.toLowerCase())
            }}
          />
        </label>
        <label>
          State
          <select
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            {example.states.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          API delay
          <select
            value={latency}
            onChange={(event) => setLatency(event.target.value)}
          >
            <option value="0">None</option>
            <option value="800">800 ms</option>
            <option value="3000">3 seconds</option>
          </select>
        </label>
        <label>
          API failure
          <select
            value={failure}
            onChange={(event) => setFailure(event.target.value)}
          >
            <option value="none">None</option>
            <option value="reads">Reads</option>
            <option value="writes">Writes</option>
          </select>
        </label>
        <label>
          Viewport
          <select
            value={width}
            onChange={(event) => setWidth(event.target.value)}
          >
            {[390, 744, 1133, 1440].map((value) => (
              <option key={value} value={value}>
                {value}px
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={masked}
            onChange={(event) => setMasked(event.target.checked)}
          />
          Mask balances
        </label>
        <label>
          <input
            type="checkbox"
            checked={monospace}
            onChange={(event) => setMonospace(event.target.checked)}
          />
          Monospace amounts
        </label>
        <label>
          <input
            type="checkbox"
            checked={motion}
            onChange={(event) => setMotion(event.target.checked)}
          />
          Reduced motion
        </label>
        <label>
          <input
            type="checkbox"
            checked={compare}
            disabled={allPages}
            onChange={(event) => setCompare(event.target.checked)}
          />
          Compare themes
        </label>
      </div>
      <div className="wb-frames">
        {allPages
          ? pageIds
              .map((id) => examples.find((entry) => entry.id === id))
              .filter((entry) => entry !== undefined)
              .map((entry) => frame(mode, entry))
          : compare
            ? modes.map((id) => frame(id))
            : frame(mode)}
      </div>
      <details>
        <summary>Resolved tokens</summary>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Value</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(
              resolveAppearance({
                mode,
                accent: accent === 'neutral' ? null : accent,
              }).colors,
            ).map(([role, value]) => (
              <tr key={role}>
                <td>{role}</td>
                <td>
                  <code>{value}</code>
                </td>
                <td style={{ background: value, minWidth: 80 }} />
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <Stack p="md">
        <Text size="sm">
          Coverage is being populated in catalog.md. Use Tab to inspect keyboard
          focus and nested portal controls.
        </Text>
      </Stack>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(
  params.get('frame') === 'true' ? (
    <Preview />
  ) : (
    <MantineProvider forceColorScheme="dark">
      <Workbench />
    </MantineProvider>
  ),
)

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    root.unmount()
    restoreIsolation()
    window.removeEventListener(
      'workbench:request-blocked',
      reportBlockedRequest,
    )
  })
