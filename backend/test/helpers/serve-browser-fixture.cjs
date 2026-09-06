// Explicit local-only full-stack fixture. Ctrl-C closes both apps and its random schema.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const backend = path.resolve(__dirname, '../..');
const frontend = path.resolve(backend, '../frontend');
const local = require('dotenv').parse(fs.readFileSync(path.join(backend, '.env')));
const schema = `browser_fixture_${randomUUID().replaceAll('-', '')}`;
Object.assign(process.env, {
  POSTGRES_HOST: '127.0.0.1', POSTGRES_PORT: '5432', POSTGRES_DB: 'splice_backend_benchmark',
  POSTGRES_USER: local.POSTGRES_USER, POSTGRES_PASSWORD: local.POSTGRES_PASSWORD,
  JWT_SECRET: randomBytes(32).toString('hex'), NODE_ENV: 'development',
  LOCAL_AUTH_BYPASS: 'true', LOCAL_AUTH_BYPASS_EMAIL: 'browser-fixture@example.test',
  FRONTEND_DOMAIN: 'http://localhost:4101', MCP_ENABLED: 'false', DISABLE_SCHEDULES: 'true',
  SEQ_SERVER_URL: '', SEQ_API_KEY: '', OPENAI_API_KEY: '',
  TS_NODE_TRANSPILE_ONLY: 'true',
});
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const { DataSource } = require('typeorm');
const { dataSourceOptions } = require('../../src/data-source');
Object.assign(dataSourceOptions, { schema, extra: { options: `-c search_path=${schema},public -c timezone=UTC`, application_name: 'splice-browser-fixture' } });
let database, app, frontendProcess, closing;
async function close() {
  if (closing) return closing;
  closing = (async () => {
    if (frontendProcess) { try { process.kill(-frontendProcess.pid, 'SIGTERM'); } catch {} }
    if (app) await app.close();
    if (database?.isInitialized) {
      await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await database.destroy();
    }
  })();
  return closing;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void close().finally(() => process.exit(0)));
async function start() {
  database = new DataSource({ ...dataSourceOptions, migrations: [path.join(backend, 'src/migrations/*.ts')] });
  await database.initialize();
  await database.query(`CREATE SCHEMA "${schema}"`);
  await database.runMigrations({ transaction: 'all' });
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../../src/app.module');
  app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.use(require('cookie-parser')());
  app.enableCors({ origin: 'http://localhost:4101', credentials: true });
  await app.init();
  const { UserEntity } = require('../../src/user/user.entity');
  const user = await database.getRepository(UserEntity).save(UserEntity.fromGoogleIdentity({ email: process.env.LOCAL_AUTH_BYPASS_EMAIL, googleSubject: 'browser-fixture' }));
  await database.query(`INSERT INTO exchange_rate_entity (id,"baseCurrency","targetCurrency",rate,"rateDate") VALUES (gen_random_uuid(),'ETH','USD','3000','2026-01-01'),(gen_random_uuid(),'EUR','USD','1.1','2026-01-01')`);
  const { AccountService } = require('../../src/account/account.service');
  const { TransactionService } = require('../../src/transaction/transaction.service');
  const { CategoryService } = require('../../src/category/category.service');
  const accountService = app.get(AccountService);
  const money = (amount, currency) => ({ money: { amount, currency }, sign: 'positive' });
  const usd = await accountService.create({ name: 'Fixture checking', type: 'depository', subType: 'checking', currentBalance: money('500000', 'USD'), availableBalance: money('500000', 'USD') }, user.id);
  const eth = await accountService.create({ name: 'Exact ETH wallet', type: 'crypto_wallet', subType: null, currentBalance: money('1000000000000000001', 'ETH'), availableBalance: money('1000000000000000001', 'ETH') }, user.id);
  await app.get(CategoryService).createCustom(user.id, { primary: 'Food', detailed: 'Restaurants', color: '#339af0' });
  const categories = await app.get(CategoryService).findAll(user.id);
  const category = categories.find((item) => item.primary !== 'UNCATEGORIZED' && !item.archivedAt);
  if (!category) throw new Error('No assignable fixture category');
  // Deterministic external price boundary; HTTP/domain/database paths remain real.
  const { MarketPriceService } = require('../../src/market-price/market-price.service');
  const quote = { symbol: 'FIXTURE', name: 'Fixture equity', quoteType: 'EQUITY', exchangeCode: 'TEST', exchangeName: 'Fixture exchange', currency: 'USD', marketIdentifierCode: null, price: '12.345678', priceAsOf: '2026-09-05', priceDatetime: '2026-09-05T12:00:00.000Z' };
  app.get(MarketPriceService).resolveQuotes = async (_userId, symbols) => ({ quotes: new Map(symbols.map(symbol => [symbol, {...quote, symbol}])), staleSymbols: [], missingSymbols: [] });
  const { ManualBrokerageService } = require('../../src/investment/manual-brokerage.service');
  const brokerage = await app.get(ManualBrokerageService).createManualBrokerageAccount({name: 'Fixture brokerage', accountCurrency: 'USD', positions: [{symbol: 'FIXTURE', quantity: '3.000000000001'}]}, user.id);
  const transactions = app.get(TransactionService);
  for (let index = 0; index < 125; index++) {
    await transactions.createManual(user.id, { accountId: usd.id, amount: { money: { amount: String(index + 100), currency: 'USD' }, sign: 'negative' }, merchantName: `Fixture merchant ${String(index).padStart(3, '0')}`, providerDate: `2026-09-${String(5 - Math.floor(index / 30)).padStart(2, '0')}`, categoryId: category.id });
  }
  await transactions.createManual(user.id, { accountId: eth.id, amount: { money: { amount: '1000000000000000001', currency: 'ETH' }, sign: 'negative' }, merchantName: 'Exact ETH transaction', providerDate: '2026-09-05', categoryId: category.id });
  await app.listen(3101, '127.0.0.1');
  frontendProcess = spawn(process.execPath, [path.join(__dirname, 'serve-browser-frontend.cjs')], { cwd: frontend, detached: true, stdio: 'inherit', env: { ...process.env, VITE_API_BASE_URL: 'http://localhost:3101', SPLICE_INTERNAL_API_BASE_URL: 'http://localhost:3101', VITE_DISABLE_DEVTOOLS: 'true' } });
  frontendProcess.once('exit', () => void close().finally(() => process.exit(0)));
  fs.writeFileSync('/tmp/splice-browser-fixture.json', JSON.stringify({ schema, userId: user.id, usdAccountId: usd.id, ethAccountId: eth.id, categoryId: category.id, brokerageAccountId: brokerage.account.id, login: 'http://localhost:3101/user/dev/login?redirect=/transactions' }, null, 2));
  console.log('Synthetic browser fixture ready: http://localhost:3101/user/dev/login?redirect=/transactions');
}
start().catch(async (error) => { console.error(error.message); await close(); process.exitCode = 1; });
