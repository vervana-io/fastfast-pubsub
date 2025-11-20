import type {MessageAttributeValue, SQSClient, SQSClientConfig} from '@aws-sdk/client-sqs';
import type { LoggerService, ModuleMetadata, Type } from '@nestjs/common';
import type { Consumer, ConsumerOptions, StopOptions } from 'sqs-consumer';
import {Deserializer, Serializer} from "@nestjs/microservices";
import {SNSClientConfig, SNSClient} from "@aws-sdk/client-sns";

//export type ProducerOptions = Parameters<typeof Producer.create>[0];
export type QueueName = string;

export type PubSubConsumerOptions = Omit<ConsumerOptions, 'handleMessage' | 'handleMessageBatch'> & {
    name: QueueName;
    stopOptions?: StopOptions;
};

export type PubSubConsumerMapValues = {
    instance: Consumer;
    stopOptions: StopOptions;
};

/*
export type PubSubProducerOptions = ProducerOptions & {
    name: QueueName;
};
*/
export interface PubSubProducerBase {
    name: QueueName;
    type: string;
}

export interface PubSubSQSProducerOption extends PubSubProducerBase {
    type: 'sqs';
    queueUrl: string;
    queueName?: string;
    sqsConfig?: SQSClientConfig;
    sqs?: SQSClient;
}

export interface PubSubSNSProducerOption extends PubSubProducerBase {
    type: 'sns';
    topicArn: string;
    topicName?: string;
    snsConfig?: SNSClientConfig;
    sns?: SNSClient;
}

export type PubSubProducerConfig = {
    accessKey: string;
    secretKey: string;
    region?: string;
    endpoint?: string;
    sns?: SNSClient;
    sqs?: SQSClient;
}
export type ProducerOptions = PubSubSQSProducerOption | PubSubSNSProducerOption;
export type PubSubProducerOptions = {
    config: PubSubProducerConfig;
    producers: ProducerOptions[];
}

export interface PubSubOptions {
    consumer?: PubSubConsumerOptions;
    consumers?: PubSubConsumerOptions[];
    producer?: PubSubProducerOptions;
    logger?: LoggerService;
    globalStopOptions?: StopOptions;
    serializer: Serializer
    deserializer: Deserializer
    scopedEnvKey?: string;
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

export interface Message {
    id: string;
    body: string;
    groupId?: string;
    deduplicationId?: string;
    delaySeconds?: number;
    messageAttributes?: Record<string, MessageAttributeValue>;
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