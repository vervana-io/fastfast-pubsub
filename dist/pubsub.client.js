"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PubSubClient = void 0;
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("@nestjs/common");
const sqs_producer_1 = require("sqs-producer");
const client_sns_1 = require("@aws-sdk/client-sns");
const rxjs_1 = require("rxjs");
class PubSubClient extends microservices_1.ClientProxy {
    constructor(options) {
        super();
        this.options = options;
        this.logger = new common_1.Logger(PubSubClient.name);
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.consumers = new Map();
        this.producers = new Map();
        this.initializeSerializer(options);
        this.initializeDeserializer(options);
        if (options.sns) {
            this.snsClient = new client_sns_1.SNSClient(options.sns);
        }
    }
    async connect() {
        if (!this.options.producer && !this.options.producers) {
            throw new Error('Producer options are not defined');
        }
        const producerOptions = this.options.producers ?? (this.options.producer ? [this.options.producer] : []);
        this.logger.log(`Initializing ${producerOptions.length} producer(s)`);
        producerOptions.forEach(options => {
            const { name, ...option } = options;
            this.logger.log(`Creating producer: ${name}`);
            if (!this.producers.has(name)) {
                const producer = sqs_producer_1.Producer.create(option);
                this.producers.set(name, producer);
                this.logger.log(`Producer '${name}' created successfully`);
            }
        });
        const producerNames = Array.from(this.producers.keys());
        this.logger.log(`Available producers: ${producerNames.join(', ')}`);
        if (this.replyQueueName) {
        }
    }
    publish(packet, callback) {
        throw new Error('Direct publish is not supported. Use emit or sendMessage for SQS/SNS.');
    }
    async handleResponse(message) {
        const { body, messageAttributes } = message;
        let rawMessage;
        try {
            rawMessage = JSON.parse(body.toString());
        }
        catch (error) {
            this.logger.error(`Unsupported JSON message data format for message '${message.id}'`);
            return;
        }
        const { err, response, isDisposed, id } = this.deserializer.deserialize(rawMessage);
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
        }
        else {
            callback({ response });
        }
        return true;
    }
    async close() {
        this.producers.clear();
    }
    unwrap() {
        if (!this.client) {
            throw new Error('Client is not initialized');
        }
        return this.client;
    }
    async publishSnsWithRetry(topicArn, pattern, data, retries = this.maxRetries) {
        try {
            const command = new client_sns_1.PublishCommand({
                TopicArn: topicArn,
                Message: JSON.stringify({ ...data, pattern }),
                MessageAttributes: {
                    pattern: {
                        DataType: 'String',
                        StringValue: pattern,
                    },
                },
            });
            await this.snsClient.send(command);
        }
        catch (error) {
            if (retries <= 0) {
                this.logger.log(`Failed to publish message to SNS after retries: ${error.message}`, 'error');
                throw error;
            }
            this.logMessage(`Error publishing message to SNS, retrying (${this.maxRetries - retries + 1}/${this.maxRetries}): ${error.message}`, 'error');
            return this.publishSnsWithRetry(topicArn, pattern, data, retries - 1);
        }
    }
    async publishUnified(pattern, data, options, retries = this.maxRetries) {
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
        let topicArn = options?.topicArn;
        if (!topicArn && options?.topic && this.options.topics) {
            const found = this.options.topics.find((t) => t.name === options.topic);
            if (found)
                topicArn = found.topicArn;
        }
        if (!topicArn && this.options.topics && this.options.topics.length > 0) {
            topicArn = this.options.topics[0].topicArn;
        }
        if (topicArn && this.snsClient) {
            await this.publishSnsWithRetry(topicArn, pattern, data, retries);
            return;
        }
    }
    emit(pattern, data, options) {
        return (0, rxjs_1.from)(this.publishUnified(pattern, data, options));
    }
    async dispatchEvent(packet) {
        const options = packet.options || {};
        await this.publishUnified(packet.pattern, packet.data, options, this.maxRetries);
    }
    async sendMessage(pattern, data, options) {
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
        let topicArn = options?.topicArn;
        if (!topicArn && options?.topic && this.options.topics) {
            const found = this.options.topics.find(t => t.name === options.topic);
            if (found)
                topicArn = found.topicArn;
        }
        if (!topicArn && this.options.topics && this.options.topics.length > 0) {
            topicArn = this.options.topics[0].topicArn;
        }
        if (topicArn && this.snsClient) {
            await this.publishSnsWithRetry(topicArn, pattern, data, this.maxRetries);
            return;
        }
    }
    createSqsMessage(serializedPacket, packet) {
        return {
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
    }
    generateMessageId() {
        return Math.random().toString(36).substring(2) + Date.now();
    }
    async sendMessageWithRetry(qlName = 'default', message, retries) {
        try {
            const producer = this.producers.get(qlName);
            if (!producer) {
                const availableProducers = Array.from(this.producers.keys());
                this.logger.error(`Producer '${qlName}' not found. Available producers: ${availableProducers.join(', ')}`);
                throw new Error(`Producer '${qlName}' not found. Available producers: ${availableProducers.join(', ')}`);
            }
            return await producer.send(message);
        }
        catch (error) {
            if (retries <= 0) {
                this.logger.log(`Failed to send message to SQS after retries: ${error.message}`, 'error');
                throw error;
            }
            this.logMessage(`Error sending message to SQS, retrying (${this.maxRetries - retries + 1}/${this.maxRetries}): ${error.message}`, 'error');
            return this.sendMessageWithRetry(qlName, message, retries - 1);
        }
    }
    logMessage(message, level = 'log') {
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
exports.PubSubClient = PubSubClient;
//# sourceMappingURL=pubsub.client.js.map