import { resolve } from 'node:path';
import {
  EXT_APPS_COMMIT,
  EXT_APPS_DIRECTORY,
  EXT_APPS_HOST_DIRECTORY,
  EXT_APPS_TAG,
  pathExists,
  run,
} from './lib.mjs';

const install = process.argv.includes('--install');

async function verifyCheckout() {
  if (!(await pathExists(resolve(EXT_APPS_DIRECTORY, '.git')))) {
    if (await pathExists(EXT_APPS_DIRECTORY)) {
      throw new Error(
        `${EXT_APPS_DIRECTORY} already exists but is not the official ext-apps Git checkout. Move it aside or set MCP_EXT_APPS_DIR to a clean path.`,
      );
    }
    return false;
  }

  const { stdout } = await run(
    'git',
    ['-C', EXT_APPS_DIRECTORY, 'rev-parse', 'HEAD'],
    { capture: true },
  );
  const actualCommit = stdout.trim();
  if (actualCommit !== EXT_APPS_COMMIT) {
    throw new Error(
      `Existing ${EXT_APPS_DIRECTORY} is ${actualCommit}; expected ${EXT_APPS_COMMIT} (${EXT_APPS_TAG}). Move it aside or set MCP_EXT_APPS_DIR to a clean path.`,
    );
  }
  const { stdout: status } = await run(
    'git',
    ['-C', EXT_APPS_DIRECTORY, 'status', '--porcelain', '--untracked-files=no'],
    { capture: true },
  );
  if (status.trim()) {
    throw new Error(
      `Existing ${EXT_APPS_DIRECTORY} has tracked source changes. Restore or move that checkout before using it as the official validation host.`,
    );
  }
  return true;
}

async function main() {
  let checkoutReady = await verifyCheckout();
  if (!checkoutReady) {
    if (!install) {
      throw new Error(
        `Official ext-apps ${EXT_APPS_TAG} is not prepared at ${EXT_APPS_DIRECTORY}. Run yarn mcp-apps:setup.`,
      );
    }
    await run('git', [
      'clone',
      '--branch',
      EXT_APPS_TAG,
      '--depth',
      '1',
      'https://github.com/modelcontextprotocol/ext-apps.git',
      EXT_APPS_DIRECTORY,
    ]);
    checkoutReady = await verifyCheckout();
  }

  if (!checkoutReady) {
    throw new Error('Official ext-apps checkout could not be prepared.');
  }

  const rootBundle = resolve(EXT_APPS_DIRECTORY, 'dist/src/app.js');
  const hostBundle = resolve(EXT_APPS_HOST_DIRECTORY, 'dist/index.html');
  const bunBinary = resolve(EXT_APPS_DIRECTORY, 'node_modules/.bin/bun');
  if (
    (await pathExists(rootBundle)) &&
    (await pathExists(hostBundle)) &&
    (await pathExists(bunBinary))
  ) {
    console.log(
      `Official ext-apps host ready: ${EXT_APPS_TAG} (${EXT_APPS_COMMIT})`,
    );
    return;
  }

  if (!install) {
    throw new Error(
      `Official ext-apps checkout is exact but not built. Run yarn mcp-apps:setup.`,
    );
  }

  await run('npm', ['ci', '--ignore-scripts', '--include=dev'], {
    cwd: EXT_APPS_DIRECTORY,
  });
  await run('node', ['node_modules/bun/install.js'], {
    cwd: EXT_APPS_DIRECTORY,
  });
  await run('npm', ['run', 'build'], { cwd: EXT_APPS_DIRECTORY });
  await run('npm', ['install', '--ignore-scripts', '--include=dev'], {
    cwd: EXT_APPS_HOST_DIRECTORY,
  });
  await run('npm', ['run', 'build'], { cwd: EXT_APPS_HOST_DIRECTORY });
  console.log(
    `Official ext-apps host prepared: ${EXT_APPS_TAG} (${EXT_APPS_COMMIT})`,
  );
}

await main();
