import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, defer } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';
import { Mutex } from 'async-mutex';

@Injectable()
export class SerializeRequestsInterceptor implements NestInterceptor {
  private mutex = new Mutex();

  intercept(_: ExecutionContext, next: CallHandler): Observable<any> {
    return defer(() => this.mutex.acquire()).pipe(
      switchMap(release => next.handle().pipe(finalize(() => release())))
    );
  }
}
