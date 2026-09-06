const { spawnSync, spawn } = require('node:child_process');
const path = require('node:path');
const cwd = path.resolve(__dirname, '../../../frontend');
const env = { ...process.env, NODE_ENV: 'production', NITRO_PORT: '4101', NITRO_HOST: '127.0.0.1', PORT: '4101', HOST: '127.0.0.1' };
if (process.env.SPLICE_BROWSER_REUSE_BUILD !== 'true') {
  const build = spawnSync('yarn', ['build'], { cwd, env, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const server = spawn(process.execPath, ['.output/server/index.mjs'], { cwd, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
