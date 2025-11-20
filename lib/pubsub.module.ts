import { Module, Global, DynamicModule, Provider } from '@nestjs/common';
import { PubSubClient } from './pubsub.client';
import { PubSubOptions,PubSubModuleAsyncOptions } from './pubsub.interface';

// Reusable constant for the options token
export const PUBSUB_OPTIONS = 'PUBSUB_OPTIONS';

@Global()
@Module({})
export class PubSubModule {
  static forRoot(options: PubSubOptions): DynamicModule {
    return {
      module: PubSubModule,
      global: true,
      providers: [
        {
          provide: PUBSUB_OPTIONS,
          useValue: options,
        },
        {
          provide: PubSubClient,
          useFactory: async (options: PubSubOptions) => {
            const client = new PubSubClient(options);
            // Automatically connect when the client is created
            await client.connect();
            return client;
          },
          inject: [PUBSUB_OPTIONS],
        },
      ],
      exports: [PubSubClient],
    };
  }

  static forRootAsync(options: PubSubModuleAsyncOptions): DynamicModule {
    return {
      module: PubSubModule,
      global: true,
      providers: [
        this.createAsyncOptionsProvider(options),
        {
          provide: PubSubClient,
          useFactory: async (options: PubSubOptions) => {
            const client = new PubSubClient(options);
            // Automatically connect when the client is created
            await client.connect();
            return client;
          },
          inject: [PUBSUB_OPTIONS],
        },
      ],
      exports: [PubSubClient],
    };
  }

  private static createAsyncOptionsProvider(options: PubSubModuleAsyncOptions): Provider {
    if (options.useFactory) {
      return {
        provide: PUBSUB_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }

    if (options.useClass) {
      return {
        provide: PUBSUB_OPTIONS,
        useClass: options.useClass,
      };
    }

    if (options.useExisting) {
      return {
        provide: PUBSUB_OPTIONS,
        useExisting: options.useExisting,
      };
    }

    throw new Error('Invalid async options');
  }
}