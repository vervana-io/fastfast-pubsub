import { SetMetadata } from '@nestjs/common';

export const PUBSUB_HANDLER_OPTIONS = 'PUBSUB_HANDLER_OPTIONS';

export interface PubSubHandlerOptions {
  batch?: boolean;
  retry?: number;
}

export function PubSubMessagePattern(pattern: string, options: PubSubHandlerOptions = {}) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    SetMetadata('pattern', pattern)(target, key, descriptor);
    SetMetadata(PUBSUB_HANDLER_OPTIONS, options)(target, key, descriptor);
  };
} 