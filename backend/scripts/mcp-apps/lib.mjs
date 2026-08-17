import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export const BACKEND_ROOT = resolve(SCRIPT_DIRECTORY, '../..');
export const REPOSITORY_ROOT = resolve(BACKEND_ROOT, '..');
export const EXT_APPS_DIRECTORY = resolve(
  process.env.MCP_EXT_APPS_DIR ?? '/tmp/mcp-ext-apps',
);
export const EXT_APPS_HOST_DIRECTORY = resolve(
  EXT_APPS_DIRECTORY,
  'examples/basic-host',
);
export const EXT_APPS_TAG = 'v1.7.5';
export const EXT_APPS_COMMIT = '92f46a574568a3ddac7600343b7d3c4c4ed7b588';

export function parseInteger(
  value,
  name,
  { minimum = 0, maximum = 65535 } = {},
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return parsed;
}

export function run(command, args, options = {}) {
  const { cwd = BACKEND_ROOT, env, capture = false } = options;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';

    if (capture) {
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} failed with ${reason}.${
            stderr.trim() ? `\n${stderr.trim()}` : ''
          }`,
        ),
      );
    });
  });
}

export function startProcess(command, args, options = {}) {
  const { cwd = BACKEND_ROOT, env, label = command } = options;
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: process.platform !== 'win32',
    stdio: 'inherit',
  });
  child.once('error', (error) => {
    console.error(`[${label}] ${error.message}`);
  });
  return child;
}

export async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = new Promise((resolvePromise) => {
    child.once('exit', resolvePromise);
  });
  try {
    if (process.platform === 'win32') {
      child.kill('SIGTERM');
    } else if (child.pid) {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error;
    }
  }

  const timedOut = await Promise.race([
    exited.then(() => false),
    new Promise((resolvePromise) => {
      setTimeout(() => resolvePromise(true), 3000);
    }),
  ]);

  if (timedOut && child.exitCode === null && child.signalCode === null) {
    try {
      if (process.platform === 'win32') {
        child.kill('SIGKILL');
      } else if (child.pid) {
        process.kill(-child.pid, 'SIGKILL');
      }
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error;
      }
    }
  }
}

export async function waitForUrl(url, timeoutMilliseconds = 30000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${url} returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  throw new Error(
    `Timed out waiting for ${url}.${
      lastError instanceof Error ? ` Last error: ${lastError.message}` : ''
    }`,
  );
}

export async function waitForProcessUrl(
  url,
  child,
  label,
  timeoutMilliseconds = 30000,
) {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(`${label} exited before ${url} became ready.`);
  }

  await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      child.off('exit', onExit);
      callback(value);
    };
    const onExit = (code, signal) => {
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      finish(rejectPromise, new Error(`${label} exited with ${reason}.`));
    };
    child.once('exit', onExit);
    void waitForUrl(url, timeoutMilliseconds).then(
      () => finish(resolvePromise),
      (error) => finish(rejectPromise, error),
    );
  });
}

export async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
