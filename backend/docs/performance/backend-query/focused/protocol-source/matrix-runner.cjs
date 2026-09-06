const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const arg = (args, name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
async function matrix(args) {
  const variant = arg(args, 'variant', 'before'),
    suite = arg(args, 'suite', 'main');
  if (
    !['before', 'after'].includes(variant) ||
    ![
      'main',
      'sync',
      'extended',
      'mixed',
      'shape',
      'memory',
      'filters',
      'auth-settings',
    ].includes(suite)
  )
    throw new Error('Invalid matrix variant or suite');
  require('./provenance.cjs').validateSourceSelection(
    path.resolve(process.env.BENCHMARK_SOURCE_ROOT),
    variant,
  );
  const root = path.resolve(
    arg(
      args,
      'output',
      path.join(__dirname, '../../docs/performance/backend-query'),
    ),
  );
  const output = suite === 'main' ? root : path.join(root, suite);
  const samples = Number(arg(args, 'samples', '100')),
    warmups = Number(arg(args, 'warmups', '5'));
  const rows = arg(
    args,
    'rows',
    suite === 'main' || suite === 'filters'
      ? '10000,100000,1000000'
      : suite === 'extended'
        ? '1000000'
        : '10000',
  )
    .split(',')
    .map(Number);
  const runs = arg(args, 'runs', '1,2,3').split(',').map(Number);
  const memoryScenarios = [
    'history.ten-years.20-accounts.daily',
    'history.ten-years.100-accounts.daily',
    'extended.history.ten-years.20-accounts.compact',
    'extended.history.ten-years.100-accounts.compact',
  ];
  const jobs =
    suite === 'memory'
      ? runs.flatMap((run) =>
          memoryScenarios.map((scenario) => ({ rows: 10000, run, scenario })),
        )
      : suite === 'mixed'
        ? runs.map((run) => ({ rows: 10000, run }))
        : rows.flatMap((rows) => runs.map((run) => ({ rows, run })));
  if (suite === 'memory') fs.mkdirSync(output, { recursive: true });
  for (const job of jobs) {
    const pauseFile =
      process.env.BENCHMARK_PAUSE_FILE || path.join(root, '.pause-captures');
    let announcedPause = false;
    while (fs.existsSync(pauseFile)) {
      if (!announcedPause)
        console.log(
          'Paused between captures for the explicit validation window.',
        );
      announcedPause = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const jobOutput = job.scenario ? path.join(output, job.scenario) : output;
    const file = path.join(
      jobOutput,
      suite === 'mixed'
        ? `${variant}-mixed-run${job.run}.json`
        : `${variant}-${job.rows}-run${job.run}.json`,
    );
    if (args.includes('--resume') && fs.existsSync(file)) {
      const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        existing.completed &&
        (suite === 'mixed'
          ? existing.seconds >= 30
          : existing.samples >= samples && existing.warmups >= warmups)
      ) {
        require('./provenance.cjs').validateReportProvenance(existing, suite);
        continue;
      }
    }
    const command =
      suite === 'mixed'
        ? ['mixed', '--seconds', '30']
        : [
            'capture',
            '--rows',
            String(job.rows),
            '--samples',
            String(samples),
            '--warmups',
            String(warmups),
          ];
    if (suite === 'main') command.push('--full');
    if (suite === 'memory')
      command.push(
        '--full',
        '--extended',
        '--memory',
        '--no-transports',
        '--filter',
        job.scenario,
      );
    if (suite === 'sync')
      command.push('--sync', '--filter', 'sync.', '--no-transports');
    if (suite === 'shape')
      command.push('--shape', '--filter', 'shape.', '--no-transports');
    if (suite === 'filters')
      command.push(
        '--filters',
        '--filter',
        'transactions.filter.',
        '--no-transports',
      );
    if (suite === 'auth-settings')
      command.push(
        '--auth-settings',
        '--filter',
        'auth-settings.',
        '--no-transports',
      );
    if (suite === 'extended')
      command.push('--extended', '--filter', 'extended.', '--no-transports');
    command.push(
      '--variant',
      variant,
      '--run',
      String(job.run),
      '--output',
      jobOutput,
    );
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          ...(suite === 'memory' ? ['--expose-gc'] : []),
          path.join(__dirname, 'matrix-child.cjs'),
          ...command,
        ],
        { stdio: 'inherit', env: process.env },
      );
      child.once('error', reject);
      child.once('exit', (code, signal) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `${suite} ${variant} ${job.rows}/${job.run} failed: ${code ?? signal}`,
              ),
            ),
      );
    });
  }
}
module.exports = { matrix };
