"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PubSubServer = void 0;
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("@nestjs/common");
const sqs_consumer_1 = require("sqs-consumer");
const constants_1 = require("@nestjs/microservices/constants");
const pubsub_context_1 = require("./pubsub.context");
const core_1 = require("@nestjs/core");
const events_1 = require("events");
const pubsub_decorator_1 = require("./pubsub.decorator");
class PubSubServer extends microservices_1.Server {
    constructor(options) {
        super();
        this.options = options;
        this.logger = new common_1.Logger(PubSubServer.name);
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.consumers = new Map();
        this.producers = new Map();
        this.pendingEventListeners = [];
        this.reflector = new core_1.Reflector();
        this.eventEmitter = new events_1.EventEmitter();
        this.options.logger = this.options.logger || new common_1.Logger('PubSubServer');
        this.options.serializer = this.options.serializer || {
            serialize: (value) => value,
        };
        this.options.deserializer = this.options.deserializer || {
            deserialize: (value) => value,
        };
        if (!this.options.consumers && !this.options.consumer) {
            throw new Error('At least one consumer configuration is required.');
        }
        this.initializeSerializer(this.options);
        this.initializeDeserializer(this.options);
    }
    getHandlerOptions(handler) {
        return this.reflector.get(pubsub_decorator_1.PUBSUB_HANDLER_OPTIONS, handler) || {};
    }
    async handleMessageBatch(messages) {
        const batchGroups = new Map();
        for (const message of messages) {
            this.logger.log(`Processing message: ${JSON.stringify({
                id: message.id || message.Id || message.MessageId,
                body: message.body || message.Body,
                messageAttributes: message.messageAttributes || message.MessageAttributes,
                hasMessageAttributes: !!(message.messageAttributes || message.MessageAttributes),
                messageAttributesKeys: message.messageAttributes ? Object.keys(message.messageAttributes) :
                    message.MessageAttributes ? Object.keys(message.MessageAttributes) : [],
            }, null, 2)}`);
            const body = message.body || message.Body;
            const messageAttributes = message.messageAttributes || message.MessageAttributes;
            let rawMessage;
            if (!body) {
                this.logger.error(`Received message without a body: ${JSON.stringify(message)}`);
                this.emit('error', 'Received message without a body');
                continue;
            }
            try {
                rawMessage = JSON.parse(body.toString());
            }
            catch (error) {
                this.logger.error(`Unsupported JSON message data format for message '${message.MessageId || message.id}'`);
                this.emit('error', error);
                continue;
            }
            if (rawMessage.Type === 'Notification' && rawMessage.Message) {
                try {
                    rawMessage = JSON.parse(rawMessage.Message);
                }
                catch (error) {
                    this.logger.error('Failed to parse SNS Message property as JSON');
                    this.emit('error', error);
                    continue;
                }
            }
            let pattern;
            if (messageAttributes && messageAttributes.pattern && messageAttributes.pattern.StringValue) {
                pattern = messageAttributes.pattern.StringValue;
                this.logger.log(`Found pattern in messageAttributes: ${pattern}`);
            }
            else if (rawMessage.pattern) {
                pattern = rawMessage.pattern;
                this.logger.log(`Found pattern in rawMessage: ${pattern}`);
            }
            if (!pattern) {
                this.logger.error('No pattern found in message attributes or body.');
                this.logger.error(`messageAttributes: ${JSON.stringify(messageAttributes)}`);
                this.logger.error(`rawMessage: ${JSON.stringify(rawMessage)}`);
                this.emit('error', 'No pattern found in message attributes or body.');
                continue;
            }
            const id = (messageAttributes && messageAttributes.id && messageAttributes.id.StringValue) || rawMessage.id;
            const packet = this.deserializer.deserialize({
                data: rawMessage,
                pattern,
                id,
            });
            const context = new pubsub_context_1.PubSubContext([message, pattern]);
            if (!batchGroups.has(pattern)) {
                batchGroups.set(pattern, []);
            }
            batchGroups.get(pattern).push({ data: packet.data, context });
        }
        for (const [pattern, batch] of batchGroups) {
            const handler = this.getHandlerByPattern(pattern);
            if (!handler) {
                this.logger.error(`No handler found for pattern: ${pattern}`);
                this.emit('processing_error');
                this.emit('error', `No handler found for pattern: ${pattern}`);
                continue;
            }
            const handlerOptions = this.reflector.get(pubsub_decorator_1.PUBSUB_HANDLER_OPTIONS, handler) || {};
            if (handlerOptions.batch) {
                try {
                    await handler(batch);
                    this.emit('batch_processed', batch);
                }
                catch (err) {
                    this.emit('processing_error');
                    this.emit('error', err);
                }
            }
            else {
                for (const { data, context } of batch) {
                    try {
                        const handlerResult = await handler(data, context);
                        if (handlerResult === true)
                            await context.ack();
                        else if (handlerResult === false)
                            await context.nack();
                        this.emit('message_processed', context.getMessage());
                    }
                    catch (err) {
                        this.emit('processing_error');
                        this.emit('error', err);
                    }
                }
            }
        }
    }
    async listen(callback) {
        const consumersToProcess = this.options.consumers || (this.options.consumer ? [this.options.consumer] : []);
        for (const options of consumersToProcess) {
            const prefix = this.options.scopedEnvKey ? `${this.options.scopedEnvKey}_` : '';
            const name = `${prefix}${options.name}`;
            const { name: _origName, ...option } = options;
            if (!this.consumers.has(name)) {
                try {
                    const consumer = sqs_consumer_1.Consumer.create({
                        ...option,
                        messageAttributeNames: ['All'],
                        handleMessage: async (message) => {
                            try {
                                await this.handleMessage(message);
                            }
                            catch (error) {
                                this.logger.error('Error handling message:', error);
                            }
                        },
                        handleMessageBatch: async (messages) => {
                            try {
                                await this.handleMessageBatch(messages);
                            }
                            catch (error) {
                                this.logger.error('Error handling message batch:', error);
                            }
                        },
                    });
                    const pending = this.pendingEventListeners.filter((f) => f.name === name);
                    for (const emitter of pending) {
                        if (emitter) {
                            consumer.on(emitter.event, emitter.callback);
                        }
                    }
                    this.pendingEventListeners = this.pendingEventListeners.filter((f) => f.name !== name);
                    consumer.on('error', (err) => {
                        this.logger.error(err);
                    });
                    consumer.start();
                    this.consumers.set(name, { instance: consumer, stopOptions: options.stopOptions });
                }
                catch (err) {
                    this.logger.error(`Failed to create/start consumer for queue '${name}':`, err);
                }
            }
        }
        callback();
    }
    async close() {
        await Promise.all(Array.from(this.consumers.values()).map(({ instance }) => instance.stop()));
    }
    emit(event, ...args) {
        this.eventEmitter.emit(event, ...args);
    }
    on(event, listener) {
        this.eventEmitter.on(event, listener);
    }
    async handleMessage(message) {
        const body = message.body || message.Body;
        const messageAttributes = message.messageAttributes || message.MessageAttributes;
        let rawMessage;
        if (!body) {
            this.logger.error(`Received message without a body: ${JSON.stringify(message)}`);
            this.emit('error', 'Received message without a body');
            return;
        }
        try {
            rawMessage = JSON.parse(body.toString());
        }
        catch (error) {
            this.logger.error(`Unsupported JSON message data format for message '${message.MessageId || message.id}'`);
            this.emit('error', error);
            return;
        }
        if (rawMessage.Type === 'Notification' && rawMessage.Message) {
            try {
                rawMessage = JSON.parse(rawMessage.Message);
            }
            catch (error) {
                this.logger.error('Failed to parse SNS Message property as JSON');
                this.emit('error', error);
                return;
            }
        }
        let pattern;
        if (messageAttributes && messageAttributes.pattern && messageAttributes.pattern.StringValue) {
            pattern = messageAttributes.pattern.StringValue;
        }
        else if (rawMessage.pattern) {
            pattern = rawMessage.pattern;
        }
        if (!pattern) {
            this.logger.error('No pattern found in message attributes or body.');
            this.emit('error', 'No pattern found in message attributes or body.');
            return;
        }
        const id = (messageAttributes && messageAttributes.id && messageAttributes.id.StringValue) || rawMessage.id;
        const packet = this.deserializer.deserialize({
            data: rawMessage,
            pattern,
            id,
        });
        const context = new pubsub_context_1.PubSubContext([message, pattern]);
        const correlationId = packet.id;
        const handler = this.getHandlerByPattern(pattern);
        if (!handler) {
            const status = 'error';
            const noHandlerPacket = {
                id: correlationId,
                status,
                err: constants_1.NO_MESSAGE_HANDLER,
            };
            this.emit('processing_error');
            this.emit('error', constants_1.NO_MESSAGE_HANDLER);
            return this.sendMessage(noHandlerPacket, messageAttributes?.id?.StringValue, correlationId);
        }
        this.emit('message_received', message);
        try {
            const handlerResult = await handler(packet.data, context);
            if (handlerResult === true)
                await context.ack();
            else if (handlerResult === false)
                await context.nack();
            this.emit('message_processed', message);
        }
        catch (err) {
            this.emit('processing_error');
            this.emit('error', err);
        }
        const response$ = this.transformToObservable(undefined);
        const publish = (data) => this.sendMessage(data, messageAttributes?.id?.StringValue, correlationId);
        response$ && this.send(response$, publish);
    }
    async sendMessage(message, replyTo, id) {
        Object.assign(message, { id });
        const outGoingResponse = this.serializer.serialize(message);
        this.logger.log(outGoingResponse);
    }
    unwrap() {
        return this.consumers;
    }
}
exports.PubSubServer = PubSubServer;
//# sourceMappingURL=pubsub.server.js.map