import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateReportProvenance } from './provenance.cjs';

describe('benchmark provenance gate', () => {
  let directory: string;
  let approvalFile: string;
  const valid = {
    variant: 'after',
    source: { hash: 'final-source' },
    implementation: {
      applicationDatabaseMetrics: true,
      httpRequestMetrics: true,
    },
    harness: { files: { 'benchmark-runner.cjs': 'current-runner-module' } },
    provenance: {
      compiledHash: 'final-build',
      measurement: { hash: 'current-main' },
    },
  };
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'splice-benchmark-provenance-'));
    approvalFile = join(directory, 'approval.json');
    writeFileSync(
      approvalFile,
      JSON.stringify({
        variants: {
          before: { sourceHash: 'old-source', compiledHash: 'old-build' },
          after: { sourceHash: 'final-source', compiledHash: 'final-build' },
        },
        profiles: { main: { hash: 'current-main' } },
        approvedRunnerHashes: ['current-runner-module'],
        legacyBeforeMainRunnerHashes: ['reviewed-original-harness'],
      }),
    );
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  it('accepts only the approved source, compiled build and workload profile', () => {
    expect(validateReportProvenance(valid, 'main', approvalFile)).toBe(true);
    for (const changed of [
      { ...valid, source: { hash: 'stale-source' } },
      {
        ...valid,
        provenance: { ...valid.provenance, compiledHash: 'stale-build' },
      },
      {
        ...valid,
        provenance: {
          ...valid.provenance,
          measurement: { hash: 'stale-observer' },
        },
      },
      {
        ...valid,
        harness: {
          files: {
            'benchmark-runner.cjs': 'changed-serializer-or-constant',
          },
        },
      },
      {
        ...valid,
        implementation: {
          ...valid.implementation,
          applicationDatabaseMetrics: false,
        },
      },
    ])
      expect(() =>
        validateReportProvenance(changed, 'main', approvalFile),
      ).toThrow();
  });
  it('allows only explicitly reviewed original main captures, never observer v1', () => {
    const legacy = {
      variant: 'before',
      source: { hash: 'old-source' },
      harness: {
        files: { 'benchmark-runner.cjs': 'reviewed-original-harness' },
      },
      environment: { instrumentation: 'v2: measured intervals' },
    };
    expect(validateReportProvenance(legacy, 'main', approvalFile)).toBe(true);
    expect(() =>
      validateReportProvenance(
        { ...legacy, environment: { instrumentation: 'v1: retained warmups' } },
        'main',
        approvalFile,
      ),
    ).toThrow();
    expect(() =>
      validateReportProvenance(legacy, 'sync', approvalFile),
    ).toThrow();
  });
});
