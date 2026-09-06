import {
  Injectable,
  Logger,
  Module,
  type MiddlewareConsumer,
  type NestMiddleware,
  type NestModule,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { performance } from 'node:perf_hooks';
import type { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import {
  installDatabaseMetrics,
  recordJsonSerializationAndSend,
  recordResponseBytes,
  runWithRequestMetrics,
} from './request-metrics';

@Injectable()
class DatabaseMetricsInstaller implements OnModuleInit {
  constructor(@InjectDataSource() private readonly database: DataSource) {}
  onModuleInit(): void {
    installDatabaseMetrics(this.database);
  }
}

@Injectable()
class RequestMetricsMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestMetrics');

  use(request: Request, response: Response, next: NextFunction): void {
    const json = response.json.bind(response) as (body: unknown) => Response;
    response.json = (body: unknown) => {
      const started = performance.now();
      try {
        return json(body);
      } finally {
        recordJsonSerializationAndSend(performance.now() - started);
      }
    };
    void runWithRequestMetrics(
      () =>
        new Promise<void>((resolve, reject) => {
          const finished = () => {
            response.off('finish', finished);
            response.off('close', finished);
            const length = response.getHeader('content-length');
            recordResponseBytes(length === undefined ? null : Number(length));
            if (response.statusCode >= 400 || !response.writableFinished)
              reject(new Error('Request failed'));
            else resolve();
          };
          response.once('finish', finished);
          response.once('close', finished);
          next();
        }),
      (metrics) => {
        const route: unknown = request.route;
        const path =
          route && typeof route === 'object' && 'path' in route
            ? route.path
            : undefined;
        this.logger.log(
          {
            transport: 'http',
            route: typeof path === 'string' ? path : 'unmatched',
            status: response.statusCode,
            ...metrics,
          },
          'Request performance',
        );
      },
    ).catch(() => undefined);
  }
}

@Module({ providers: [DatabaseMetricsInstaller] })
export class RequestMetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestMetricsMiddleware).forRoutes('{*path}');
  }
}
