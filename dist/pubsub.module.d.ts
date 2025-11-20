import { DynamicModule } from '@nestjs/common';
import { PubSubOptions, PubSubModuleAsyncOptions } from './pubsub.interface';
export declare const PUBSUB_OPTIONS = "PUBSUB_OPTIONS";
export declare class PubSubModule {
    static forRoot(options: PubSubOptions): DynamicModule;
    static forRootAsync(options: PubSubModuleAsyncOptions): DynamicModule;
    private static createAsyncOptionsProvider;
}
