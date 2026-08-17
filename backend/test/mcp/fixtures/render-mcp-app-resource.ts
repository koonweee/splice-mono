import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { APP_RESOURCES, renderMcpAppHtml } from '../../../src/mcp/mcp-apps';

const outputDir = process.argv[2] ?? '/tmp/splice-mcp-app-resource-fixtures';

mkdirSync(outputDir, { recursive: true });

for (const app of Object.values(APP_RESOURCES)) {
  const filename = app.resourceUri.replace('ui://splice/', '');
  const outputPath = join(outputDir, filename);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderMcpAppHtml(app));
  console.log(outputPath);
}
