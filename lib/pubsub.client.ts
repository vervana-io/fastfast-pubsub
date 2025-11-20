import {ClientProxy, ReadPacket, WritePacket} from "@nestjs/microservices";
import {PubSubEvents} from "./pubsub.events";
import {Logger} from "@nestjs/common";
import {QueueName, PubSubOptions, Message} from "./pubsub.interface";
import { Observable, from } from 'rxjs';
import {Producer} from "./producer/producer";

export class PubSubClient extends ClientProxy<PubSubEvents>{

    protected readonly logger =  new Logger(PubSubClient.name)
    private readonly maxRetries = 3; // Number of retry attempts for sending messages
    private readonly retryDelay = 1000; // Delay between retry attempts in milliseconds
    private client: any; // Keep for compatibility
    private replyQueueName?: string;
    public readonly producers = new Map<QueueName, Producer>();

    constructor(protected options : PubSubOptions) {
        super();

        this.initializeSerializer(options);
        this.initializeDeserializer(options);
    }

    async connect(): Promise<void> {
        if (!this.options.producer) {
            throw new Error('Producer options are not defined');
        }
        
        const producers = this.options.producer.producers
        const config = this.options.producer.config;
        producers.forEach(producerOption => {
            if (!this.producers.has(producerOption.name)) {
                const producer = new Producer(producerOption, config);
                this.producers.set(producerOption.name, producer)
                this.logger.log(`Producer '${producerOption.name}' created successfully`);
            }
        })
        
        this.logger.log(`Initializing ${producers.length} producer(s)`);

        
        const producerNames = Array.from(this.producers.keys());
        this.logger.log(`Available producers: ${producerNames.join(', ')}`);

        if (this.replyQueueName) {

        }
    }

    // Implement the abstract publish method from ClientProxy as a stub
    protected publish(packet: ReadPacket<any>, callback: (packet: WritePacket<any>) => void): () => void {
        throw new Error('Direct publish is not supported. Use emit or sendMessage for SQS/SNS.');
    }
    /**
     * Gracefully shuts down the client, cleaning up resources.
     * Clears the producers map.
     */
    async close(): Promise<void> {
        this.producers.clear();
    }

    public unwrap<T>(): T {
        if (!this.client) {
            throw new Error('Client is not initialized');
        }
        return this.client as T;
    }

    /**
     * Sends a message to the SQS queue or SNS topic with the given pattern and data.
     * If queueName is provided, uses SQS. Otherwise, uses SNS (by topic, topicArn, or default).
     */
    public async sendMessage<T = any>(
        pattern: string,
        data: T,
        options: { name: string }
    ) {
        // Ensure client is connected before sending
        await this.ensureConnected();
        
        // Prefer SQS if queueName is provided or type is 'sqs'
        const packet = {
            pattern,
            data,
            id: this.generateMessageId(),
        };
        const serializedPacket = this.serializer.serialize(packet);
        const message = this.createMessage(serializedPacket, packet);
        const producer = this.producers.get(options.name)
        if (!producer) {
            throw new Error(`Producer '${options.name}' not found`);
        }
        await producer.send(message, this.maxRetries)
        return;
    }

    /**
     * Override emit to use unified publish method for SQS/SNS.
     */
    public emit<TInput = any>(
        pattern: any,
        data: TInput,
        options?: { name: string }
    ): Observable<any> {
        return from(this.publishUnified(pattern, data, options));
    }

    /**
     * Override dispatchEvent to use unified publish method for SQS/SNS.
     */
    async dispatchEvent(packet: any): Promise<any> {
        // Ensure client is connected before dispatching
        await this.ensureConnected();
        
        const options = packet.options || {};
        await this.publishUnified(packet.pattern, packet.data, options, this.maxRetries);
    }

    protected async publishUnified<T = any>(
        pattern: string,
        data: T,
        options: { name: string},
        retries: number = this.maxRetries
    ): Promise<void> {
        // Ensure client is connected before publishing
        await this.ensureConnected();
        
        const packet = {
            pattern,
            data,
            id: this.generateMessageId(),
        };

        const serializedPacket = this.serializer.serialize(packet);
        const message = this.createMessage(serializedPacket, packet);
        const producer = this.producers.get(options.name)
        if (!producer) {
            throw new Error(`Producer '${options.name}' not found`);
        }
        await producer.send(message, retries)
        return;
    }

    /**
     * Ensures the client is connected. Connects if not already connected.
     */
    private async ensureConnected(): Promise<void> {
        if (this.producers.size === 0) {
            await this.connect();
        }
    }

    /**
     * Creates a formatted message based on the packet data.
     * @param serializedPacket - The serialized packet.
     * @param packet - The original packet (for id, pattern, etc.).
     * @returns The formatted SQS message.
     */
    private createMessage(serializedPacket: any, packet: any): Message {
        // Debug logging to see what's being created
        this.logger.log(`Creating SQS message with packet: ${JSON.stringify(packet)}`);
        this.logger.log(`Serialized packet: ${JSON.stringify(serializedPacket)}`);
        
        const message = {
            body: JSON.stringify(serializedPacket.data),
            groupId: packet.id,
            messageAttributes: {
                pattern: {
                    DataType: 'String',
                    StringValue: packet.pattern,
                },
                id: {
                    DataType: 'String',
                    StringValue: packet.id,
                },
            },
            id: packet.id,
        };
        
        this.logger.log(`Created SQS message: ${JSON.stringify(message)}`);
        return message;
    }

    // Utility to generate a unique message ID (simple example)
    private generateMessageId(): string {
        return Math.random().toString(36).substring(2) + Date.now();
    }
    
    private logMessage(message: string, level: 'log' | 'error' = 'log'): void {
        switch (level) {
            case 'error':
                this.logger.error(message);
                break;
            case 'log':
            default:
                this.logger.log(message);
                break;
        }
    }
} 