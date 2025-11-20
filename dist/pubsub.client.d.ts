import { ClientProxy, ReadPacket, WritePacket } from "@nestjs/microservices";
import { PubSubEvents } from "./pubsub.events";
import { Logger } from "@nestjs/common";
import { PubSubOptions } from "./pubsub.interface";
import { Observable } from 'rxjs';
import { Producer } from "./producer/producer";
export declare class PubSubClient extends ClientProxy<PubSubEvents> {
    protected options: PubSubOptions;
    protected readonly logger: Logger;
    private readonly maxRetries;
    private readonly retryDelay;
    private client;
    private replyQueueName?;
    readonly producers: Map<string, Producer>;
    constructor(options: PubSubOptions);
    connect(): Promise<void>;
    protected publish(packet: ReadPacket<any>, callback: (packet: WritePacket<any>) => void): () => void;
    close(): Promise<void>;
    unwrap<T>(): T;
    sendMessage<T = any>(pattern: string, data: T, options: {
        name: string;
    }): Promise<void>;
    emit<TInput = any>(pattern: any, data: TInput, options?: {
        name: string;
    }): Observable<any>;
    dispatchEvent(packet: any): Promise<any>;
    protected publishUnified<T = any>(pattern: string, data: T, options: {
        name: string;
    }, retries?: number): Promise<void>;
    private ensureConnected;
    private createMessage;
    private generateMessageId;
    private logMessage;
}
