"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PubSubClient = void 0;
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const producer_1 = require("./producer/producer");
class PubSubClient extends microservices_1.ClientProxy {
    constructor(options) {
        super();
        this.options = options;
        this.logger = new common_1.Logger(PubSubClient.name);
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.producers = new Map();
        this.initializeSerializer(options);
        this.initializeDeserializer(options);
    }
    async connect() {
        if (!this.options.producer) {
            throw new Error('Producer options are not defined');
        }
        const producers = this.options.producer.producers;
        const config = this.options.producer.config;
        producers.forEach(producerOption => {
            if (!this.producers.has(producerOption.name)) {
                const producer = new producer_1.Producer(producerOption, config);
                this.producers.set(producerOption.name, producer);
                this.logger.log(`Producer '${producerOption.name}' created successfully`);
            }
        });
        this.logger.log(`Initializing ${producers.length} producer(s)`);
        const producerNames = Array.from(this.producers.keys());
        this.logger.log(`Available producers: ${producerNames.join(', ')}`);
        if (this.replyQueueName) {
        }
    }
    publish(packet, callback) {
        throw new Error('Direct publish is not supported. Use emit or sendMessage for SQS/SNS.');
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
    async sendMessage(pattern, data, options) {
        await this.ensureConnected();
        const packet = {
            pattern,
            data,
            id: this.generateMessageId(),
        };
        const serializedPacket = this.serializer.serialize(packet);
        const message = this.createMessage(serializedPacket, packet);
        const producer = this.producers.get(options.name);
        if (!producer) {
            throw new Error(`Producer '${options.name}' not found`);
        }
        await producer.send(message, this.maxRetries);
        return;
    }
    emit(pattern, data, options) {
        return (0, rxjs_1.from)(this.publishUnified(pattern, data, options));
    }
    async dispatchEvent(packet) {
        await this.ensureConnected();
        const options = packet.options || {};
        await this.publishUnified(packet.pattern, packet.data, options, this.maxRetries);
    }
    async publishUnified(pattern, data, options, retries = this.maxRetries) {
        await this.ensureConnected();
        const packet = {
            pattern,
            data,
            id: this.generateMessageId(),
        };
        const serializedPacket = this.serializer.serialize(packet);
        const message = this.createMessage(serializedPacket, packet);
        const producer = this.producers.get(options.name);
        if (!producer) {
            throw new Error(`Producer '${options.name}' not found`);
        }
        await producer.send(message, retries);
        return;
    }
    async ensureConnected() {
        if (this.producers.size === 0) {
            await this.connect();
        }
    }
    createMessage(serializedPacket, packet) {
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
    generateMessageId() {
        return Math.random().toString(36).substring(2) + Date.now();
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