import { isIP } from 'node:net';

export type DisabledMcpRuntimeConfig = {
  enabled: false;
};

export type EnabledMcpRuntimeConfig = {
  enabled: true;
  port: number;
  issuer: URL;
  resourceServerUrl: URL;
  allowedHostnames: readonly string[];
  allowedOriginHostnames: readonly string[];
};

export type SpliceMcpRuntimeConfig =
  | DisabledMcpRuntimeConfig
  | EnabledMcpRuntimeConfig;

function parseEnabled(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  throw new Error('MCP_ENABLED must be either true or false.');
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when MCP_ENABLED=true.`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  const raw = value?.trim() || '3001';
  if (!/^\d+$/.test(raw)) {
    throw new Error('MCP_PORT must be an integer between 1 and 65535.');
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('MCP_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseUrl(name: string, value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must be an absolute HTTP(S) URL without credentials, query, or fragment.`,
    );
  }
  return url;
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

function isValidHostname(hostname: string): boolean {
  const ipCandidate =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  if (isIP(ipCandidate) !== 0) return true;
  if (hostname.length > 253) return false;
  return hostname
    .split('.')
    .every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
    );
}

function parseHostnameList(name: string, value: string): readonly string[] {
  const entries = value.split(',');
  if (entries.some((hostname) => hostname.trim().length === 0)) {
    throw new Error(`${name} must not contain empty hostname entries.`);
  }

  const hostnames = entries.map((hostname) => hostname.trim().toLowerCase());

  if (hostnames.length === 0) {
    throw new Error(`${name} must contain at least one hostname.`);
  }

  const unique = [...new Set(hostnames)];
  for (const hostname of unique) {
    let parsed: URL;
    try {
      parsed = new URL(`https://${hostname}`);
    } catch {
      throw new Error(`${name} contains an invalid hostname.`);
    }
    if (
      parsed.hostname !== hostname ||
      parsed.port ||
      parsed.pathname !== '/' ||
      /[\s/@*]/.test(hostname) ||
      !isValidHostname(hostname)
    ) {
      throw new Error(
        `${name} must contain hostnames without schemes, paths, or ports.`,
      );
    }
  }
  return unique;
}

export function parseMcpRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): SpliceMcpRuntimeConfig {
  if (!parseEnabled(env.MCP_ENABLED)) {
    return { enabled: false };
  }

  const issuer = parseUrl('AUTH0_ISSUER', required(env, 'AUTH0_ISSUER'));
  if (issuer.pathname !== '/') {
    throw new Error('AUTH0_ISSUER must be an issuer origin with no path.');
  }
  issuer.pathname = '/';

  const resourceServerUrl = parseUrl(
    'MCP_SERVER_URL',
    required(env, 'MCP_SERVER_URL'),
  );
  if (resourceServerUrl.pathname !== '/mcp') {
    throw new Error('MCP_SERVER_URL must use the exact /mcp resource path.');
  }

  for (const [name, url] of [
    ['AUTH0_ISSUER', issuer],
    ['MCP_SERVER_URL', resourceServerUrl],
  ] as const) {
    if (
      url.protocol !== 'https:' &&
      (env.NODE_ENV === 'production' || !isLoopbackHostname(url.hostname))
    ) {
      throw new Error(
        `${name} must use HTTPS except for loopback development URLs.`,
      );
    }
  }

  const allowedHostnames = parseHostnameList(
    'MCP_ALLOWED_HOSTNAMES',
    required(env, 'MCP_ALLOWED_HOSTNAMES'),
  );
  if (!allowedHostnames.includes(resourceServerUrl.hostname.toLowerCase())) {
    throw new Error(
      'MCP_ALLOWED_HOSTNAMES must include the MCP_SERVER_URL hostname.',
    );
  }

  return {
    enabled: true,
    port: parsePort(env.MCP_PORT),
    issuer,
    resourceServerUrl,
    allowedHostnames,
    allowedOriginHostnames: parseHostnameList(
      'MCP_ALLOWED_ORIGIN_HOSTNAMES',
      required(env, 'MCP_ALLOWED_ORIGIN_HOSTNAMES'),
    ),
  };
}
