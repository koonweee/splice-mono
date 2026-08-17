import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import {
  BACKEND_ROOT,
  EXT_APPS_HOST_DIRECTORY,
  REPOSITORY_ROOT,
  parseInteger,
  pathExists,
  run,
  startProcess,
  stopProcess,
  waitForProcessUrl,
  writeJson,
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

const appFilter = valueAfter('--app', 'all');
const caseFilter = valueAfter('--case', undefined);
const supportedAppFilters = new Set(['all', 'cash-flow', 'portfolio']);
if (!supportedAppFilters.has(appFilter)) {
  throw new Error(
    `App must be one of: ${[...supportedAppFilters].join(', ')}.`,
  );
}

const stamp = new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replaceAll('.', '-');
const outputDirectory = resolve(
  valueAfter(
    '--output',
    resolve(
      REPOSITORY_ROOT,
      'tmp/recordings/mcp-apps',
      `${stamp}-${scenario}-${appFilter}`,
    ),
  ),
);
const session = `splice-mcp-apps-${process.pid}`;
const hostUrl = `http://127.0.0.1:${hostPort}`;

const appDefinitions = [
  {
    key: 'cash-flow',
    filter: 'cash-flow',
    tool: 'visualize_cash_flow',
    resource: 'ui://splice/cash-flow/v3.html',
    title: 'Cash Flow',
    cases: [
      {
        key: 'overview',
        title: 'Overview',
        input: { startDate: '2026-04-01', endDate: '2026-04-30' },
      },
      {
        key: 'inflow',
        title: 'Income focus',
        input: {
          startDate: '2026-04-01',
          endDate: '2026-04-30',
          direction: 'inflow',
        },
      },
      {
        key: 'comparison',
        title: 'Comparison',
        input: {
          startDate: '2026-04-01',
          endDate: '2026-04-30',
          comparison: { startDate: '2026-03-01', endDate: '2026-03-31' },
        },
      },
      {
        key: 'focus',
        title: 'Focused category',
        input: {
          startDate: '2026-04-01',
          endDate: '2026-04-30',
          focusCategoryPrimary: 'GROCERIES',
        },
      },
    ],
  },
  {
    key: 'portfolio-viewer',
    filter: 'portfolio',
    tool: 'show_portfolio_viewer',
    resource: 'ui://splice/portfolio-viewer/v2.html',
    title: 'Portfolio Viewer',
    cases: [{ key: 'overview', title: 'Overview', input: {} }],
  },
];

function defaultCaseKeys(app) {
  if (app.key !== 'cash-flow') {
    return new Set(['overview']);
  }
  if (scenario === 'populated') {
    return new Set(['overview', 'inflow', 'comparison', 'focus']);
  }
  if (scenario === 'helper-error') {
    return new Set(['focus']);
  }
  return new Set(['overview']);
}

const selectedCaptures = appDefinitions
  .filter((app) => appFilter === 'all' || app.filter === appFilter)
  .flatMap((app) => {
    const caseKeys = caseFilter ? new Set([caseFilter]) : defaultCaseKeys(app);
    return app.cases
      .filter((captureCase) => caseKeys.has(captureCase.key))
      .map((captureCase) => ({
        app,
        captureCase,
        expectAppResource: !(
          scenario === 'primary-error' && app.key === 'cash-flow'
        ),
      }));
  });

if (selectedCaptures.length === 0) {
  throw new Error(
    `No capture case matched --app ${appFilter}${
      caseFilter ? ` --case ${caseFilter}` : ''
    }.`,
  );
}

let fixture;
let host;
let browserOpened = false;
const observations = [];

async function browser(args, { capture = false } = {}) {
  return run('agent-browser', ['--session', session, ...args], {
    cwd: REPOSITORY_ROOT,
    capture,
  });
}

async function clearBrowserEvidence() {
  await browser(['network', 'requests', '--clear']);
  await browser(['console', '--clear']);
  await browser(['errors', '--clear']);
}

async function waitForCaptureReady({ app, captureCase, expectAppResource }) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { stdout } = await browser(['network', 'requests', '--json'], {
      capture: true,
    });
    const requests = JSON.parse(stdout).data.requests;
    const calledTool = requests.some(
      (request) =>
        request.status === 200 &&
        request.postData?.includes('"method":"tools/call"') &&
        request.postData?.includes(`"name":"${app.tool}"`),
    );
    const readResource = requests.some(
      (request) =>
        request.status === 200 &&
        request.postData?.includes('"method":"resources/read"') &&
        request.postData?.includes(`"uri":"${app.resource}"`),
    );
    const loadedSandbox = requests.some(
      (request) =>
        request.status === 200 &&
        request.url.startsWith('http://localhost:8081/sandbox.html'),
    );
    const expectsFocusHelper =
      app.key === 'cash-flow' &&
      captureCase.key === 'focus' &&
      scenario !== 'primary-error';
    const calledFocusHelper = requests.some(
      (request) =>
        request.status === 200 &&
        request.postData?.includes('"method":"tools/call"') &&
        request.postData?.includes(
          '"name":"list_cashflow_category_transactions"',
        ),
    );

    if (
      calledTool &&
      (!expectAppResource || (readResource && loadedSandbox)) &&
      (!expectsFocusHelper || calledFocusHelper)
    ) {
      await browser(['wait', '400']);
      return;
    }
    await browser(['wait', '250']);
  }

  throw new Error(
    `${app.title} / ${captureCase.title}: official host did not reach the expected MCP transport boundary within 10 seconds.`,
  );
}

async function callTool({ app, captureCase, expectAppResource }) {
  const url = `${hostUrl}/?tool=${encodeURIComponent(app.tool)}&theme=hide`;
  browserOpened = true;
  await browser(['open', url]);
  await browser(['wait', '1000']);
  await clearBrowserEvidence();
  await browser([
    'find',
    'role',
    'textbox',
    'fill',
    JSON.stringify(captureCase.input, null, 2),
  ]);
  await browser([
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Call Tool',
    '--exact',
  ]);
  await waitForCaptureReady({ app, captureCase, expectAppResource });
}

async function collectEvidence(capture, viewport) {
  const { app, captureCase } = capture;
  const prefix = `${app.key}-${captureCase.key}-${viewport}`;
  const screenshot = resolve(outputDirectory, `${prefix}.png`);
  await browser(['screenshot', '--full', screenshot]);
  const { stdout: errors } = await browser(['errors', '--json'], {
    capture: true,
  });
  const { stdout: consoleOutput } = await browser(['console', '--json'], {
    capture: true,
  });
  const { stdout: network } = await browser(['network', 'requests', '--json'], {
    capture: true,
  });
  await writeFile(resolve(outputDirectory, `${prefix}-errors.json`), errors);
  await writeFile(
    resolve(outputDirectory, `${prefix}-console.json`),
    consoleOutput,
  );
  await writeFile(resolve(outputDirectory, `${prefix}-network.json`), network);
  observations.push({
    ...capture,
    viewport,
    screenshot,
    errors,
    consoleOutput,
    network,
  });
}

function assertEvidence() {
  const failures = [];
  for (const observation of observations) {
    const { app, captureCase, expectAppResource } = observation;
    const label = `${app.title} / ${captureCase.title} (${observation.viewport})`;
    const errorResult = JSON.parse(observation.errors);
    if (errorResult.data.errors.length > 0) {
      failures.push(`${label}: browser page errors were reported.`);
    }

    const consoleResult = JSON.parse(observation.consoleOutput);
    const unexpectedConsoleErrors = consoleResult.data.messages.filter(
      (message) => message.type === 'error',
    );
    if (
      unexpectedConsoleErrors.length > 0 &&
      scenario !== 'helper-error' &&
      scenario !== 'primary-error'
    ) {
      failures.push(`${label}: browser console errors were reported.`);
    }

    const networkResult = JSON.parse(observation.network);
    const requests = networkResult.data.requests;
    const urls = requests.map((request) => request.url);
    const external = urls.filter((url) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return false;
        }
        return (
          parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost'
        );
      } catch {
        return false;
      }
    });
    if (external.length > 0) {
      failures.push(
        `${label}: unexpected external requests: ${[...new Set(external)].join(', ')}`,
      );
    }
    const calledTool = requests.some(
      (request) =>
        request.status === 200 &&
        request.postData?.includes('"method":"tools/call"') &&
        request.postData?.includes(`"name":"${app.tool}"`),
    );
    const readResource = requests.some(
      (request) =>
        request.status === 200 &&
        request.postData?.includes('"method":"resources/read"') &&
        request.postData?.includes(`"uri":"${app.resource}"`),
    );
    const loadedSandbox = requests.some(
      (request) =>
        request.status === 200 &&
        request.url.startsWith('http://localhost:8081/sandbox.html'),
    );
    if (!calledTool) {
      failures.push(`${label}: the real MCP tool call was not observed.`);
    }
    if (expectAppResource && (!readResource || !loadedSandbox)) {
      failures.push(
        `${label}: the App resource read or official sandbox load was not observed.`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

async function makeContactSheets() {
  const builder = resolve(
    process.env.MCP_APP_CONTACT_SHEET_BUILDER ??
      resolve(
        homedir(),
        '.codex/skills/ui-change-contact-sheet/scripts/build_contact_sheet.py',
      ),
  );
  const groups = [
    'desktop-dark',
    'mobile-dark',
    'mobile-light',
    'narrow-320-dark',
  ];
  const outputs = [];
  if (!(await pathExists(builder))) {
    throw new Error(
      `Contact-sheet builder not found at ${builder}. Install the ui-change-contact-sheet Codex skill or set MCP_APP_CONTACT_SHEET_BUILDER.`,
    );
  }

  for (const group of groups) {
    const manifestPath = resolve(
      outputDirectory,
      `contact-sheet-${group}.json`,
    );
    const htmlPath = resolve(outputDirectory, `contact-sheet-${group}.html`);
    const pngPath = resolve(outputDirectory, `contact-sheet-${group}.png`);
    const panels = observations
      .filter(({ viewport }) => viewport === group)
      .map(({ app, captureCase, viewport, screenshot }) => ({
        title: `${app.title} — ${captureCase.title}`,
        summary: `${scenario} fixture · official ext-apps ${viewport} host capture`,
        screenshot: basename(screenshot),
        annotations: [],
      }));
    await writeJson(manifestPath, {
      title: `Splice MCP Apps — ${group}`,
      subtitle:
        'Real authenticated fixture through the tagged official ext-apps host',
      meta: `Scenario: ${scenario} · App: ${appFilter} · ${group}`,
      panels,
    });
    await run('python3', [builder, manifestPath, '--output', htmlPath], {
      cwd: outputDirectory,
    });
    if (group !== 'desktop-dark') {
      const html = await readFile(htmlPath, 'utf8');
      await writeFile(
        htmlPath,
        html.replace(
          '</style>',
          '.panels{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}@media(max-width:900px){.panels{grid-template-columns:1fr}}</style>',
        ),
        'utf8',
      );
    }
    await browser(['set', 'viewport', '3200', '1800']);
    await browser(['open', `file://${htmlPath}`]);
    await browser(['screenshot', '--full', pngPath]);
    outputs.push(pngPath);
  }

  return outputs;
}

async function recordInteraction({ app, captureCase, expectAppResource }) {
  const video = resolve(
    outputDirectory,
    `${app.key}-${captureCase.key}-loading-to-ready.webm`,
  );
  const frameDirectory = resolve(
    outputDirectory,
    `${app.key}-${captureCase.key}-transition-frames-${Date.now()}`,
  );
  await mkdir(frameDirectory, { recursive: true });
  await browser(['set', 'device', 'iPhone 12']);
  await browser(['set', 'media', 'dark']);
  await browser(['open', `${hostUrl}/?tool=${app.tool}&theme=hide`]);
  await browser(['wait', '1000']);
  await browser([
    'find',
    'role',
    'textbox',
    'fill',
    JSON.stringify(captureCase.input, null, 2),
  ]);
  let frame = 0;
  const captureFrame = async () => {
    const path = resolve(
      frameDirectory,
      `frame-${String(frame).padStart(3, '0')}.png`,
    );
    frame += 1;
    await browser(['screenshot', path]);
  };
  await captureFrame();
  await browser([
    'find',
    'role',
    'button',
    'click',
    '--name',
    'Call Tool',
    '--exact',
  ]);
  for (let index = 0; index < 4; index += 1) {
    await captureFrame();
    await browser(['wait', '250']);
  }
  await waitForCaptureReady({ app, captureCase, expectAppResource });
  await captureFrame();
  await browser(['wait', '400']);
  await captureFrame();
  await run('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '4',
    '-i',
    resolve(frameDirectory, 'frame-%03d.png'),
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuv420p',
    video,
  ]);
  return video;
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await run('node', ['scripts/mcp-apps/prepare-host.mjs', '--install']);
  await run('yarn', ['build:mcp-apps']);

  fixture = startProcess(
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
  await waitForProcessUrl(
    `http://127.0.0.1:${fixturePort}/healthz`,
    fixture,
    'Authenticated MCP fixture',
  );
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
    `${hostUrl}/api/servers`,
    host,
    'Official ext-apps host',
  );

  browserOpened = true;
  await browser(['open', hostUrl]);
  const videos = [];

  for (const capture of selectedCaptures) {
    await browser(['set', 'viewport', '1440', '1100']);
    await browser(['set', 'media', 'dark']);
    await callTool(capture);
    await collectEvidence(capture, 'desktop-dark');

    await browser(['set', 'device', 'iPhone 12']);
    await browser(['set', 'media', 'dark']);
    await collectEvidence(capture, 'mobile-dark');

    await browser(['set', 'media', 'light']);
    await collectEvidence(capture, 'mobile-light');

    await browser(['set', 'viewport', '320', '900']);
    await browser(['set', 'media', 'dark']);
    await collectEvidence(capture, 'narrow-320-dark');

    videos.push(await recordInteraction(capture));
  }

  assertEvidence();
  const contactSheets = await makeContactSheets();
  await writeJson(resolve(outputDirectory, 'summary.json'), {
    scenario,
    appFilter,
    caseFilter: caseFilter ?? null,
    captures: selectedCaptures.map(({ app, captureCase }) => ({
      app: app.key,
      tool: app.tool,
      resource: app.resource,
      case: captureCase.key,
      input: captureCase.input,
    })),
    generatedAt: new Date().toISOString(),
    officialHost: 'modelcontextprotocol/ext-apps v1.7.5',
    outputDirectory,
    contactSheets,
    videos,
  });
  console.log(`\nVisual evidence written to ${outputDirectory}`);
  console.log(`Contact sheets:\n${contactSheets.join('\n')}`);
}

try {
  await main();
} finally {
  if (browserOpened) {
    try {
      await browser(['close']);
    } catch {
      // Preserve the original failure after best-effort browser cleanup.
    }
  }
  await Promise.all([stopProcess(fixture), stopProcess(host)]);
}
