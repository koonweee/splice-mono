/** Export current controller metadata without connecting to any database. */
import 'reflect-metadata';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { generateSchemaComponents } from '../../src/common/zod-api-response';
import { fixNullableRefs } from '../../src/common/openapi-utils';

async function main() {
  const output = process.argv[2];
  if (!output) throw new Error('Pass an OpenAPI JSON output path');
  const source = path.resolve(__dirname, '../../src');
  const files = await readdir(source, { recursive: true });
  const loadController = createRequire(__filename);
  const controllers: Type[] = [];
  const dependencies = new Set<Type>();
  for (const file of files.filter((file) => file.endsWith('.controller.ts'))) {
    const exports = loadController(path.join(source, file)) as Record<
      string,
      Type
    >;
    for (const controller of Object.values(exports)) {
      if (
        typeof controller !== 'function' ||
        !Reflect.hasMetadata('path', controller)
      )
        continue;
      controllers.push(controller);
      const parameters = Reflect.getMetadata(
        'design:paramtypes',
        controller,
      ) as Type[] | undefined;
      for (const dependency of parameters ?? []) dependencies.add(dependency);
    }
  }
  const module = await Test.createTestingModule({
    controllers,
    providers: [...dependencies].map((provide) => ({ provide, useValue: {} })),
  }).compile();
  const app = module.createNestApplication();
  try {
    const config = new DocumentBuilder()
      .setTitle('Splice API')
      .setDescription('Financial account management API')
      .setVersion('1.0')
      .addBearerAuth()
      .addSecurityRequirements('bearer')
      .build();
    const document = SwaggerModule.createDocument(app, {
      ...config,
      openapi: '3.1.0',
    });
    document.components ??= {};
    Object.assign(
      (document.components.schemas ??= {}),
      generateSchemaComponents(),
    );
    await writeFile(
      output,
      JSON.stringify(fixNullableRefs(document), null, 2) + '\n',
    );
    console.info(`Exported ${controllers.length} controllers to ${output}`);
  } finally {
    await app.close();
  }
}
void main();
