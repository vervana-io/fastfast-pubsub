import { ClientProxy, ReadPacket, WritePacket } from "@nestjs/microservices";
import { PubSubEvents } from "./pubsub.events";
import { Logger } from "@nestjs/common";
import { PubSubConsumerMapValues, PubSubOptions } from "./pubsub.interface";
import { Message } from "sqs-producer";
import { SQSClient } from '@aws-sdk/client-sqs';
import { Observable } from 'rxjs';
export declare class PubSubClient extends ClientProxy<PubSubEvents> {
    protected options: PubSubOptions;
    protected readonly logger: Logger;
    private readonly maxRetries;
    private readonly retryDelay;
    private client;
    private replyQueueName?;
    readonly consumers: Map<string, PubSubConsumerMapValues>;
    readonly producers: Map<string, SQSClient>;
    private snsClient?;
    constructor(options: PubSubOptions);
    connect(): Promise<void>;
    protected publish(packet: ReadPacket<any>, callback: (packet: WritePacket<any>) => void): () => void;
    handleResponse(message: Message): Promise<boolean>;
    close(): Promise<void>;
    unwrap<T>(): T;
    protected publishSnsWithRetry<T = any>(topicArn: string, pattern: string, data: T, retries?: number): Promise<void>;
    protected publishUnified<T = any>(pattern: string, data: T, options?: {
        queueName?: string;
        topic?: string;
        topicArn?: string;
        type?: 'sqs' | 'sns';
    }, retries?: number): Promise<void>;
    emit<TInput = any>(pattern: any, data: TInput, options?: {
        queueName?: string;
        topic?: string;
        topicArn?: string;
        type?: 'sqs' | 'sns';
    }): Observable<any>;
    dispatchEvent(packet: any): Promise<any>;
    sendMessage<T = any>(pattern: string, data: T, options?: {
        queueName?: string;
        topic?: string;
        topicArn?: string;
        type?: 'sqs' | 'sns';
    }): Promise<void>;
    private createSqsMessage;
    private generateMessageId;
    private sendMessageWithRetry;
    private getQueueUrl;
    private logMessage;
}
