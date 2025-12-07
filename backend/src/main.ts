import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { generateSchemaComponents } from './common/zod-api-response';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Enable raw body for webhook signature verification
    rawBody: true,
  });

  // Enable CORS for frontend
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:4000',
      'https://splice-app.jtkw.me',
      'https://splice.jtkw.me',
    ],
    credentials: true,
  });

  // Setup Swagger/OpenAPI
  const config = new DocumentBuilder()
    .setTitle('Splice API')
    .setDescription('Financial account management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // Merge Zod schema components into the OpenAPI document
  const zodSchemas = generateSchemaComponents();
  document.components = document.components ?? {};
  document.components.schemas = {
    ...document.components.schemas,
    ...(zodSchemas as typeof document.components.schemas),
  };

  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Server is running on port ${process.env.PORT ?? 3000}`);
}
void bootstrap();
