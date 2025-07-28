import {ClientProxy, IncomingResponse, ReadPacket, WritePacket} from "@nestjs/microservices";
import {PubSubEvents} from "./pubsub.events";
import {Logger} from "@nestjs/common";
import {QueueName, PubSubConsumerMapValues, PubSubOptions} from "./pubsub.interface";
import {type SendMessageBatchResultEntry} from "@aws-sdk/client-sqs";
import {Message} from "sqs-producer";
import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { Observable, from } from 'rxjs';

export class PubSubClient extends ClientProxy<PubSubEvents>{

    protected readonly logger =  new Logger(PubSubClient.name)
    private readonly maxRetries = 3; // Number of retry attempts for sending messages
    private readonly retryDelay = 1000; // Delay between retry attempts in milliseconds
    private client: any; // Keep for compatibility
    private replyQueueName?: string;
    public readonly consumers = new Map<QueueName, PubSubConsumerMapValues>();
    public readonly producers = new Map<QueueName, SQSClient>();
    private snsClient?: SNSClient;

    constructor(protected options : PubSubOptions) {
        super();

        this.initializeSerializer(options);
        this.initializeDeserializer(options);
        if (options.sns) {
            this.snsClient = new SNSClient(options.sns);
        }
    }

    async connect(): Promise<void> {
        if (!this.options.producer && !this.options.producers) {
            throw new Error('Producer options are not defined');
        }
        
        const producerOptions = this.options.producers ?? (this.options.producer ? [this.options.producer] : []);
        
        this.logger.log(`Initializing ${producerOptions.length} producer(s)`);
        
        producerOptions.forEach(options => {
            const {name, ...option} = options;
            this.logger.log(`Creating producer: ${name}`);
            if (!this.producers.has(name)) {
                const producer = new SQSClient(option);
                this.producers.set(name, producer);
                this.logger.log(`Producer '${name}' created successfully`);
            }
        });
        
        const producerNames = Array.from(this.producers.keys());
        this.logger.log(`Available producers: ${producerNames.join(', ')}`);

        if (this.replyQueueName) {

        }
    }

    // Implement the abstract publish method from ClientProxy as a stub
    protected publish(packet: ReadPacket<any>, callback: (packet: WritePacket<any>) => void): () => void {
        throw new Error('Direct publish is not supported. Use emit or sendMessage for SQS/SNS.');
    }

    async handleResponse(message: Message) {
        const {body, messageAttributes} = message
        let rawMessage;
        try {
            rawMessage = JSON.parse(body.toString())
        }catch (error: any) {
            this.logger.error(
                `Unsupported JSON message data format for message '${message.id}'`,
            );
            return;
        }
        const {err, response, isDisposed, id} = this.deserializer.deserialize(rawMessage) as IncomingResponse;
        const correlationId = messageAttributes.id.StringValue || id;
        const callback = this.routingMap.get(correlationId);
        if (!callback) {
            return false;
        }

        if (err || isDisposed) {
            callback({
                err,
                response,
                isDisposed
            });
        }else {
            callback({response});
        }
        return true;
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

    protected async publishSnsWithRetry<T = any>(
        topicArn: string,
        pattern: string,
        data: T,
        retries: number = this.maxRetries
    ): Promise<void> {
        try {
            const command = new PublishCommand({
                TopicArn: topicArn,
                Message: JSON.stringify({ ...data, pattern }),
                MessageAttributes: {
                    pattern: {
                        DataType: 'String',
                        StringValue: pattern,
                    },
                },
            });
            await this.snsClient!.send(command);
        } catch (error: any) {
            if (retries <= 0) {
                this.logger.log(
                    `Failed to publish message to SNS after retries: ${error.message}`,
                    'error',
                );
                throw error;
            }
            this.logMessage(
                `Error publishing message to SNS, retrying (${this.maxRetries - retries + 1}/${this.maxRetries}): ${error.message}`,
                'error',
            );
            return this.publishSnsWithRetry(topicArn, pattern, data, retries - 1);
        }
    }

    protected async publishUnified<T = any>(
        pattern: string,
        data: T,
        options?: { queueName?: string; topic?: string; topicArn?: string; type?: 'sqs' | 'sns' },
        retries: number = this.maxRetries
    ): Promise<void> {
        // Prefer SQS if queueName is provided or type is 'sqs'
        if (options?.queueName || options?.type === 'sqs') {
            const qName = options?.queueName || 'default';
            const packet = {
                pattern,
                data,
                id: this.generateMessageId(),
            };
            const serializedPacket = this.serializer.serialize(packet);
            const message = this.createSqsMessage(serializedPacket, packet);
            await this.sendMessageWithRetry(qName, message, retries);
            return;
        }

        // SNS logic: determine topicArn
        let topicArn = options?.topicArn;
        if (!topicArn && options?.topic && this.options.topics) {
            const found = this.options.topics.find((t: any) => t.name === options.topic);
            if (found) topicArn = found.topicArn;
        }
        if (!topicArn && this.options.topics && this.options.topics.length > 0) {
            topicArn = this.options.topics[0].topicArn;
        }

        if (topicArn && this.snsClient) {
            await this.publishSnsWithRetry(topicArn, pattern, data, retries);
            return;
        }
        // If no SNS client or topicArn, do nothing (or optionally log a warning)
    }

    /**
     * Override emit to use unified publish method for SQS/SNS.
     */
    public emit<TInput = any>(
        pattern: any,
        data: TInput,
        options?: { queueName?: string; topic?: string; topicArn?: string; type?: 'sqs' | 'sns' }
    ): Observable<any> {
        return from(this.publishUnified(pattern, data, options));
    }

    /**
     * Override dispatchEvent to use unified publish method for SQS/SNS.
     */
    async dispatchEvent(packet: any): Promise<any> {
        const options = packet.options || {};
        await this.publishUnified(packet.pattern, packet.data, options, this.maxRetries);
    }

    /**
     * Sends a message to the SQS queue or SNS topic with the given pattern and data.
     * If queueName is provided, uses SQS. Otherwise, uses SNS (by topic, topicArn, or default).
     */
    public async sendMessage<T = any>(
        pattern: string,
        data: T,
        options?: { queueName?: string; topic?: string; topicArn?: string; type?: 'sqs' | 'sns' }
    ) {
        // Prefer SQS if queueName is provided or type is 'sqs'
        if (options?.queueName || options?.type === 'sqs') {
            const qName = options?.queueName || 'default';
            this.logger.log(`Sending message to SQS queue: ${qName}, pattern: ${pattern}`);
            
            const packet = {
                pattern,
                data,
                id: this.generateMessageId(),
            };
            const serializedPacket = this.serializer.serialize(packet);
            const message = this.createSqsMessage(serializedPacket, packet);
            await this.sendMessageWithRetry(qName, message, this.maxRetries);
            return;
        }

        // SNS logic: determine topicArn
        let topicArn = options?.topicArn;
        if (!topicArn && options?.topic && this.options.topics) {
            const found = this.options.topics.find(t => t.name === options.topic);
            if (found) topicArn = found.topicArn;
        }
        if (!topicArn && this.options.topics && this.options.topics.length > 0) {
            topicArn = this.options.topics[0].topicArn;
        }

        if (topicArn && this.snsClient) {
            await this.publishSnsWithRetry(topicArn, pattern, data, this.maxRetries);
            return;
        }
        // If no SNS client or topicArn, do nothing (or optionally log a warning)
    }

    /**
     * Creates a formatted SQS message based on the packet data.
     * @param serializedPacket - The serialized packet.
     * @param packet - The original packet (for id, pattern, etc.).
     * @returns The formatted SQS message.
     */
    private createSqsMessage(serializedPacket: any, packet: any): Message {
        // Debug logging to see what's being created
        this.logger.log(`Creating SQS message with packet: ${JSON.stringify(packet)}`);
        this.logger.log(`Serialized packet: ${JSON.stringify(serializedPacket)}`);
        
        const message = {
            body: JSON.stringify(serializedPacket.data),
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

    /**
     * Sends a message to SQS with retry logic.
     * @param qlName
     * @param message - The formatted SQS message.
     * @param retries - The number of retry attempts remaining.
     * @returns A promise that resolves with the SQS response or rejects with an error.
     */
    private async sendMessageWithRetry(
        qlName: QueueName = 'default',
        message: Message,
        retries: number,
    ): Promise<any> {

        try {
            const producer = this.producers.get(qlName);
            
            // Debug logging to help identify the issue
            if (!producer) {
                const availableProducers = Array.from(this.producers.keys());
                this.logger.error(`Producer '${qlName}' not found. Available producers: ${availableProducers.join(', ')}`);
                throw new Error(`Producer '${qlName}' not found. Available producers: ${availableProducers.join(', ')}`);
            }
            
            // Debug logging to see what the producer is actually sending
            this.logger.log(`Producer sending message: ${JSON.stringify(message)}`);
            
            // Use AWS SDK directly instead of sqs-producer
            const command = new SendMessageCommand({
                QueueUrl: this.getQueueUrl(qlName),
                MessageBody: message.body,
                MessageAttributes: message.messageAttributes,
                MessageGroupId: message.groupId,
                MessageDeduplicationId: message.deduplicationId,
                DelaySeconds: message.delaySeconds,
            });
            
            const result = await producer.send(command);
            this.logger.log(`Producer send result: ${JSON.stringify(result)}`);
            return [result]; // Return as array to match expected type
        } catch (error: any) {
            if (retries <= 0) {
                this.logger.log(
                    `Failed to send message to SQS after retries: ${error.message}`,
                    'error',
                );
                throw error;
            }

            this.logMessage(
                `Error sending message to SQS, retrying (${this.maxRetries - retries + 1}/${this.maxRetries}): ${error.message}`,
                'error',
            );
           // await this.delay(this.retryDelay);
            return this.sendMessageWithRetry(qlName, message, retries - 1);
        }
    }
    
    /**
     * Logs messages at various levels.
     * @param message - The message to log.
     * @param level - The log level ('log' or 'error').
     */
    private getQueueUrl(queueName: QueueName): string {
        // Find the producer configuration for this queue name
        const producerOptions = this.options.producers ?? (this.options.producer ? [this.options.producer] : []);
        const producerConfig = producerOptions.find(p => p.name === queueName);
        if (!producerConfig) {
            throw new Error(`Producer configuration not found for queue: ${queueName}`);
        }
        return producerConfig.queueUrl;
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