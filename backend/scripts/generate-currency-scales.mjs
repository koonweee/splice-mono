import { readFileSync, writeFileSync } from 'node:fs';

const source = new URL('../src/common/currency-scales.ts', import.meta.url);
const target = new URL('../../frontend/src/lib/currency-scales.generated.ts', import.meta.url);
writeFileSync(target, `// Generated from backend/src/common/currency-scales.ts. Do not edit.\n${readFileSync(source, 'utf8')}`);
