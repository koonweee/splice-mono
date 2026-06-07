import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_RESOURCES, readMcpAppResource } from '../../../src/mcp/mcp-apps';

const outputDir = process.argv[2] ?? '/tmp/splice-mcp-app-resource-fixtures';

mkdirSync(outputDir, { recursive: true });

for (const app of Object.values(APP_RESOURCES)) {
  const resource = readMcpAppResource(new URL(app.resourceUri), app);
  const content = resource.contents[0];
  if (!('text' in content) || typeof content.text !== 'string') {
    throw new Error(`Expected text resource content for ${app.resourceUri}`);
  }

  const filename = app.resourceUri.replace('ui://splice/', '');
  const outputPath = join(outputDir, filename);
  writeFileSync(outputPath, content.text);
  console.log(outputPath);
}
