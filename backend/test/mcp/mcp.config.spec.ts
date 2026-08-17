import { parseMcpRuntimeConfig } from '../../src/mcp/mcp.config';

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  MCP_ENABLED: 'true',
  MCP_PORT: '3001',
  MCP_SERVER_URL: 'https://splice-mcp.kw0.dev/mcp',
  AUTH0_ISSUER: 'https://auth.kw0.dev',
  MCP_ALLOWED_HOSTNAMES: 'splice-mcp.kw0.dev',
  MCP_ALLOWED_ORIGIN_HOSTNAMES: 'chatgpt.com, chat.openai.com',
};

describe('parseMcpRuntimeConfig', () => {
  it('keeps MCP opt-in and ignores Auth0 configuration while disabled', () => {
    expect(parseMcpRuntimeConfig({ MCP_ENABLED: 'false' })).toEqual({
      enabled: false,
    });
    expect(parseMcpRuntimeConfig({})).toEqual({ enabled: false });
  });

  it('parses and normalizes a valid enabled configuration', () => {
    expect(parseMcpRuntimeConfig(VALID_ENV)).toEqual({
      enabled: true,
      port: 3001,
      issuer: new URL('https://auth.kw0.dev/'),
      resourceServerUrl: new URL('https://splice-mcp.kw0.dev/mcp'),
      allowedHostnames: ['splice-mcp.kw0.dev'],
      allowedOriginHostnames: ['chatgpt.com', 'chat.openai.com'],
    });
  });

  it('defaults the enabled listener to port 3001', () => {
    expect(
      parseMcpRuntimeConfig({ ...VALID_ENV, MCP_PORT: undefined }),
    ).toMatchObject({ enabled: true, port: 3001 });
  });

  it.each(['yes', 'TRUE', '0'])(
    'rejects invalid MCP_ENABLED value %s',
    (value) => {
      expect(() =>
        parseMcpRuntimeConfig({ ...VALID_ENV, MCP_ENABLED: value }),
      ).toThrow('MCP_ENABLED');
    },
  );

  it.each(['0', '65536', '3.5', 'port'])('rejects invalid port %s', (port) => {
    expect(() =>
      parseMcpRuntimeConfig({ ...VALID_ENV, MCP_PORT: port }),
    ).toThrow('MCP_PORT');
  });

  it('requires all enabled-mode values', () => {
    for (const name of [
      'MCP_SERVER_URL',
      'AUTH0_ISSUER',
      'MCP_ALLOWED_HOSTNAMES',
      'MCP_ALLOWED_ORIGIN_HOSTNAMES',
    ]) {
      expect(() =>
        parseMcpRuntimeConfig({ ...VALID_ENV, [name]: undefined }),
      ).toThrow(`${name} is required`);
    }
  });

  it.each([
    ['MCP_SERVER_URL', 'not-a-url'],
    ['MCP_SERVER_URL', 'https://splice-mcp.kw0.dev/wrong'],
    ['MCP_SERVER_URL', 'https://user@splice-mcp.kw0.dev/mcp'],
    ['AUTH0_ISSUER', 'https://auth.kw0.dev/oauth'],
    ['AUTH0_ISSUER', 'ftp://auth.kw0.dev/'],
  ])('rejects malformed %s value', (name, value) => {
    expect(() =>
      parseMcpRuntimeConfig({ ...VALID_ENV, [name]: value }),
    ).toThrow();
  });

  it('requires HTTPS URLs in production but permits local HTTP in development', () => {
    const local = {
      ...VALID_ENV,
      NODE_ENV: 'development',
      AUTH0_ISSUER: 'http://localhost:3010',
      MCP_SERVER_URL: 'http://127.0.0.1:3001/mcp',
      MCP_ALLOWED_HOSTNAMES: '127.0.0.1',
    };
    expect(parseMcpRuntimeConfig(local)).toMatchObject({ enabled: true });
    expect(() =>
      parseMcpRuntimeConfig({ ...local, NODE_ENV: 'production' }),
    ).toThrow('must use HTTPS');
    expect(() =>
      parseMcpRuntimeConfig({
        ...local,
        AUTH0_ISSUER: 'http://auth.example.com',
      }),
    ).toThrow('must use HTTPS');
    expect(() =>
      parseMcpRuntimeConfig({
        ...local,
        MCP_SERVER_URL: 'http://mcp.example.com/mcp',
        MCP_ALLOWED_HOSTNAMES: 'mcp.example.com',
      }),
    ).toThrow('must use HTTPS');
  });

  it.each([
    ['https://splice-mcp.kw0.dev', 'splice-mcp.kw0.dev'],
    ['splice-mcp.kw0.dev:3001', 'splice-mcp.kw0.dev:3001'],
    ['splice-mcp.kw0.dev/path', 'splice-mcp.kw0.dev/path'],
    ['splice-mcp.kw0.dev,', 'chatgpt.com'],
    ['splice-mcp.kw0.dev', 'chatgpt.com,,chat.openai.com'],
    ['*.kw0.dev', 'chatgpt.com'],
    ['splice_mcp.kw0.dev', 'chatgpt.com'],
    ['splice-mcp..kw0.dev', 'chatgpt.com'],
    ['-splice-mcp.kw0.dev', 'chatgpt.com'],
  ])('rejects invalid hostname lists', (hosts, origins) => {
    expect(() =>
      parseMcpRuntimeConfig({
        ...VALID_ENV,
        MCP_ALLOWED_HOSTNAMES: hosts,
        MCP_ALLOWED_ORIGIN_HOSTNAMES: origins,
      }),
    ).toThrow();
  });

  it('requires the resource hostname in the Host allowlist', () => {
    expect(() =>
      parseMcpRuntimeConfig({
        ...VALID_ENV,
        MCP_ALLOWED_HOSTNAMES: 'example.com',
      }),
    ).toThrow('must include the MCP_SERVER_URL hostname');
  });

  it('normalizes and de-duplicates hostname lists', () => {
    expect(
      parseMcpRuntimeConfig({
        ...VALID_ENV,
        MCP_ALLOWED_HOSTNAMES: ' SPLICE-MCP.KW0.DEV, splice-mcp.kw0.dev ',
        MCP_ALLOWED_ORIGIN_HOSTNAMES: 'CHATGPT.COM,chatgpt.com',
      }),
    ).toMatchObject({
      allowedHostnames: ['splice-mcp.kw0.dev'],
      allowedOriginHostnames: ['chatgpt.com'],
    });
  });

  it('normalizes the issuer to an origin with a trailing slash', () => {
    const config = parseMcpRuntimeConfig({
      ...VALID_ENV,
      AUTH0_ISSUER: 'https://AUTH.KW0.DEV',
    });

    expect(config.enabled && config.issuer.href).toBe('https://auth.kw0.dev/');
  });
});
