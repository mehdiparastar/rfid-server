// src/common/interceptors/serialize.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  UseInterceptors,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import type { ClassTransformOptions } from "class-transformer";
import { Observable, map } from "rxjs";
import type { Readable } from "stream";

type ClassConstructor<T = any> = new (...args: any[]) => T;

const DEFAULT_TRANSFORM_OPTS: ClassTransformOptions = {
  excludeExtraneousValues: true,
  enableImplicitConversion: true,
  // exposeDefaultValues: true, // uncomment if you want defaults included
};

export function Serialize<T>(dto: ClassConstructor<T>, opts: ClassTransformOptions = {}) {
  return UseInterceptors(new SerializeInterceptor<T>(dto, opts));
}

export class SerializeInterceptor<T> implements NestInterceptor {
  constructor(
    private readonly dto: ClassConstructor<T>,
    private readonly opts: ClassTransformOptions = DEFAULT_TRANSFORM_OPTS
  ) { }

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (data == null) return data;

        // Skip binary/streaming responses
        if (Buffer.isBuffer(data) || isReadableStream(data)) return data;

        // Array of items
        if (Array.isArray(data)) {
          return data.map((item) => plainToInstance(this.dto, item, this.opts));
        }

        // Simple pagination envelope: { data: [...], ...meta }
        if (isPaginationEnvelope(data)) {
          return {
            ...data,
            data: data.data.map((item: any) => plainToInstance(this.dto, item, this.opts)),
          };
        }

        // Single object
        if (typeof data === "object") {
          return plainToInstance(this.dto, data, this.opts);
        }

        // Primitive (string/number/boolean) — just return as-is
        return data;
      })
    );
  }
}

function isReadableStream(obj: any): obj is Readable {
  return obj && typeof obj.pipe === "function" && typeof obj.read === "function";
}

function isPaginationEnvelope(obj: any): obj is { data: any[] } {
  return obj && typeof obj === "object" && Array.isArray(obj.data);
}
