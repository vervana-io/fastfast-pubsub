import { Server } from "@nestjs/microservices";
import { PubSubEvents } from "./pubsub.events";
import { Logger } from "@nestjs/common";
import { Producer } from "sqs-producer/dist/esm";
import { PubSubConsumerMapValues, PubSubOptions } from "./pubsub.interface";
export declare class PubSubServer extends Server<PubSubEvents> {
    protected options: PubSubOptions;
    protected logger: Logger;
    private readonly maxRetries;
    private readonly retryDelay;
    private client;
    private replyQueueName?;
    readonly consumers: Map<string, PubSubConsumerMapValues>;
    readonly producers: Map<string, Producer>;
    protected pendingEventListeners: Array<{
        name: string;
        event: keyof PubSubEvents;
        callback: PubSubEvents[keyof PubSubEvents];
    }>;
    private reflector;
    private eventEmitter;
    constructor(options: PubSubOptions);
    private getHandlerOptions;
    listen(callback: () => void): Promise<any>;
    close(): Promise<void>;
    emit<EventKey extends keyof PubSubEvents>(event: EventKey, ...args: Parameters<PubSubEvents[EventKey]>): void;
    on<EventKey extends keyof PubSubEvents>(event: EventKey, listener: PubSubEvents[EventKey]): void;
    handleMessage(message: any): Promise<void>;
    sendMessage<T = any>(message: T, replyTo: string, id: string): Promise<void>;
    unwrap<T = any>(): T;
}
