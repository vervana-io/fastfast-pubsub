import { Message, ProducerOptions, PubSubProducerConfig } from "../pubsub.interface";
import { Logger } from "@nestjs/common";
export declare class Producer {
    protected options: ProducerOptions;
    private batchSize;
    private sqs;
    private sns;
    protected readonly logger: Logger;
    private readonly maxRetries;
    constructor(options: ProducerOptions, config: PubSubProducerConfig);
    private setup;
    send(message: Message | Message[], retries?: number): Promise<any>;
    protected publishSnsWithRetry<T = any>(topicArn: string, data: Message, retries?: number): Promise<void>;
    private sendSQSBatch;
    private sendSNSBatch;
    private sendMessageWithRetry;
    private sendMessage;
    private publicMessage;
}
