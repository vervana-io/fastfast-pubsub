import type { MessageAttributeValue } from '@aws-sdk/client-sqs';
import type { LoggerService, ModuleMetadata, Type } from '@nestjs/common';
import type { Consumer, ConsumerOptions, StopOptions } from 'sqs-consumer';
import type { Producer } from 'sqs-producer';
import {Deserializer, Serializer} from "@nestjs/microservices";

export type ProducerOptions = Parameters<typeof Producer.create>[0];
export type QueueName = string;

export type PubSubConsumerOptions = Omit<ConsumerOptions, 'handleMessage' | 'handleMessageBatch'> & {
    name: QueueName;
    stopOptions?: StopOptions;
};

export type PubSubConsumerMapValues = {
    instance: Consumer;
    stopOptions: StopOptions;
};

export type PubSubProducerOptions = ProducerOptions & {
    name: QueueName;
};

export interface PubSubOptions {
    consumer?: PubSubConsumerOptions;
    producer?: PubSubProducerOptions;
    consumers?: PubSubConsumerOptions[];
    producers?: PubSubProducerOptions[];
    logger?: LoggerService;
    globalStopOptions?: StopOptions;
    serializer: Serializer
    deserializer: Deserializer
    scopedEnvKey?: string;
    topics?: Array<{ name: string; topicArn: string }>;
    sns?: any; // SNS.ClientConfiguration, but use any for compatibility
}

export interface PubSubModuleOptionsFactory {
    createOptions(): Promise<PubSubOptions> | PubSubOptions;
}

export interface PubSubModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    useExisting?: Type<PubSubModuleOptionsFactory>;
    useClass?: Type<PubSubModuleOptionsFactory>;
    useFactory?: (...args: any[]) => Promise<PubSubOptions> | PubSubOptions;
    inject?: any[];
}

export interface Message<T = any> {
    id: string;
    body: T;
    groupId?: string;
    deduplicationId?: string;
    delaySeconds?: number;
    messageAttributes?: Record<string, MessageAttributeValue>;
}

export interface PubSubMessageHandlerMeta {
    name: string;
    batch?: boolean;
}

export interface PubSubConsumerEventHandlerMeta {
    name: string;
    eventName: string;
} 