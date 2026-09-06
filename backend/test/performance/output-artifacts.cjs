const fs = require('node:fs');
const path = require('node:path');
const arg = (args, name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};

/** Add output evidence to older raw reports without changing any timing samples. */
async function outputs(args) {
  const harness = require('./benchmark-runner.cjs');
  const root = path.resolve(
    arg(
      args,
      'output',
      path.join(__dirname, '../../docs/performance/backend-query'),
    ),
  );
  const variant = arg(args, 'variant', 'before');
  const reports = fs
    .readdirSync(root)
    .filter((f) => new RegExp(`^${variant}-\\d+-run\\d+\\.json$`).test(f))
    .map((file) => ({
      file,
      value: JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')),
    }));
  const missing = reports.filter(
    (r) =>
      r.value.completed &&
      r.value.scenarios.some((s) => !s.baselineFailure && !s.outputArtifact),
  );
  for (const rows of [...new Set(missing.map((r) => r.value.fixture.rows))]) {
    const peers = reports.filter((r) => r.value.fixture.rows === rows);
    const references = new Map();
    for (const peer of peers)
      for (const s of peer.value.scenarios)
        if (s.outputArtifact)
          references.set(s.name, { scenario: s, report: peer.value });
    if (
      peers.some((p) =>
        p.value.scenarios.some(
          (s) => !s.baselineFailure && !references.has(s.name),
        ),
      )
    ) {
      const capture = await harness.capture([
        'capture',
        '--variant',
        variant,
        '--rows',
        String(rows),
        '--samples',
        '1',
        '--warmups',
        '0',
        '--full',
        '--output',
        path.join(root, 'output-evidence'),
      ]);
      for (const s of capture.scenarios)
        if (s.outputArtifact)
          references.set(s.name, {
            scenario: {
              ...s,
              outputArtifact: path.join('output-evidence', s.outputArtifact),
            },
            report: capture,
          });
    }
    for (const peer of peers) {
      for (const s of peer.value.scenarios) {
        if (s.baselineFailure || s.outputArtifact) continue;
        const reference = references.get(s.name);
        if (
          !reference ||
          reference.report.fixtureHash !== peer.value.fixtureHash ||
          reference.report.source.hash !== peer.value.source.hash ||
          reference.scenario.outputDigest !== s.outputDigest
        )
          throw new Error(
            `Output identity mismatch for ${peer.file}/${s.name}`,
          );
        s.outputArtifact = reference.scenario.outputArtifact;
        s.outputArtifactEvidence =
          'Reproduced from identical frozen source/fixture and verified against original full-output digest; original timing samples unchanged.';
      }
      fs.writeFileSync(
        path.join(root, peer.file),
        JSON.stringify(peer.value) + '\n',
      );
    }
  }
}
module.exports = { outputs };
