import { createHash } from 'node:crypto';
import { watch } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BACKEND_ROOT,
  EXT_APPS_HOST_DIRECTORY,
  parseInteger,
  run,
  startProcess,
  stopProcess,
  waitForProcessUrl,
} from './lib.mjs';

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
}

const fixturePort = parseInteger(
  valueAfter('--fixture-port', '3102'),
  'Fixture port',
  { minimum: 1 },
);
const hostPort = 8080;
const sandboxPort = 8081;
const scenario = valueAfter('--scenario', 'populated');
const supportedScenarios = new Set([
  'populated',
  'empty',
  'helper-error',
  'primary-error',
]);
if (!supportedScenarios.has(scenario)) {
  throw new Error(
    `Scenario must be one of: ${[...supportedScenarios].join(', ')}.`,
  );
}

let fixture;
let host;
let rebuilding = false;
let stopping = false;
let debounce;
let watchedSourceFingerprint;

const appSourceDirectory = resolve(BACKEND_ROOT, 'src/mcp/apps');
const watchedSourceFiles = [
  resolve(BACKEND_ROOT, 'src/mcp/mcp-apps.ts'),
  resolve(BACKEND_ROOT, 'src/mcp/mcp.definition.ts'),
];

async function sourceFingerprint() {
  const appSourceFiles = (
    await readdir(appSourceDirectory, { recursive: true })
  )
    .filter(
      (filename) =>
        (filename.endsWith('.ts') || filename.endsWith('.mjs')) &&
        !filename.endsWith('app-runtime.generated.ts'),
    )
    .map((filename) => resolve(appSourceDirectory, filename));
  const hash = createHash('sha256');
  for (const path of [...appSourceFiles, ...watchedSourceFiles].sort()) {
    hash.update(path);
    hash.update(await readFile(path));
  }
  return hash.digest('hex');
}

async function startFixture() {
  const nextFixture = startProcess(
    'yarn',
    [
      'ts-node',
      '-r',
      'tsconfig-paths/register',
      'test/mcp/fixtures/serve-mcp-app-fixture.ts',
      String(fixturePort),
      scenario,
    ],
    { cwd: BACKEND_ROOT, label: 'fixture' },
  );
  fixture = nextFixture;
  nextFixture.once('exit', () => {
    if (!stopping && !rebuilding && fixture === nextFixture) {
      console.error('Authenticated MCP fixture exited unexpectedly.');
      void shutdown(1);
    }
  });
  await waitForProcessUrl(
    `http://127.0.0.1:${fixturePort}/healthz`,
    nextFixture,
    'Authenticated MCP fixture',
  );
}

async function rebuild() {
  if (rebuilding) {
    return;
  }
  rebuilding = true;
  try {
    console.log('\nRebuilding MCP Apps browser bundle…');
    await run('yarn', ['build:mcp-apps']);
    await stopProcess(fixture);
    await startFixture();
    console.log('MCP Apps refreshed in the official host. Reload the page.\n');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  } finally {
    rebuilding = false;
  }
}

async function rebuildIfSourcesChanged() {
  try {
    const nextFingerprint = await sourceFingerprint();
    if (nextFingerprint === watchedSourceFingerprint) {
      return;
    }
    watchedSourceFingerprint = nextFingerprint;
    await rebuild();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

async function shutdown(exitCode = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  if (debounce) {
    clearTimeout(debounce);
  }
  await Promise.all([stopProcess(fixture), stopProcess(host)]);
  process.exitCode = exitCode;
}

try {
  await run('node', ['scripts/mcp-apps/prepare-host.mjs', '--install']);
  await run('yarn', ['build:mcp-apps']);
  await startFixture();
  host = startProcess('npm', ['run', 'serve'], {
    cwd: EXT_APPS_HOST_DIRECTORY,
    label: 'official-host',
    env: {
      HOST_PORT: String(hostPort),
      SANDBOX_PORT: String(sandboxPort),
      SERVERS: JSON.stringify([`http://127.0.0.1:${fixturePort}/mcp`]),
    },
  });
  await waitForProcessUrl(
    `http://127.0.0.1:${hostPort}/api/servers`,
    host,
    'Official ext-apps host',
  );
} catch (error) {
  await Promise.all([stopProcess(fixture), stopProcess(host)]);
  throw error;
}

watchedSourceFingerprint = await sourceFingerprint();

const watchedPaths = [
  { path: appSourceDirectory, recursive: true },
  { path: resolve(BACKEND_ROOT, 'src/mcp/mcp-apps.ts'), recursive: false },
  {
    path: resolve(BACKEND_ROOT, 'src/mcp/mcp.definition.ts'),
    recursive: false,
  },
];
const watchers = watchedPaths.map(({ path, recursive }) =>
  watch(path, { recursive }, (_event, filename) => {
    if (
      stopping ||
      rebuilding ||
      !filename ||
      filename.endsWith('app-runtime.generated.ts')
    ) {
      return;
    }
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => void rebuildIfSourcesChanged(), 150);
  }),
);

console.log(`\nSplice MCP Apps development loop is ready.`);
console.log(`Scenario: ${scenario}`);
console.log(`Official host: http://127.0.0.1:${hostPort}`);
console.log(`Authenticated MCP fixture: http://127.0.0.1:${fixturePort}/mcp`);
console.log('Edit src/mcp/apps/**; the bundle and fixture will refresh.');
console.log('Press Ctrl+C to stop every local process.\n');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    for (const watcher of watchers) {
      watcher.close();
    }
    void shutdown();
  });
}

host.once('exit', () => {
  if (!stopping) {
    console.error('Official ext-apps host exited unexpectedly.');
    void shutdown(1);
  }
});
