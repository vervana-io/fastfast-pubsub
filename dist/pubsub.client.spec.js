"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const producer_1 = require("./producer/producer");
jest.mock('./producer/producer');
const MockedProducer = producer_1.Producer;
jest.mock('@nestjs/common', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        log: jest.fn(),
        error: jest.fn(),
    })),
}));
jest.mock('@nestjs/microservices', () => ({
    ClientProxy: class MockClientProxy {
        constructor() {
            this.serializer = { serialize: jest.fn() };
            this.deserializer = { deserialize: jest.fn() };
        }
        initializeSerializer() { }
        initializeDeserializer() { }
    }
}));
const mockSerializer = {
    serialize: jest.fn().mockImplementation((packet) => ({
        data: packet.data,
        pattern: packet.pattern,
        id: packet.id,
    })),
};
const mockDeserializer = {
    deserialize: jest.fn().mockImplementation((data) => data),
};
const pubsub_client_1 = require("./pubsub.client");
describe('PubSubClient', () => {
    let client;
    let mockProducer;
    let options;
    let producerOptions;
    beforeEach(() => {
        jest.clearAllMocks();
        mockProducer = {
            send: jest.fn().mockResolvedValue('message-sent'),
        };
        MockedProducer.mockImplementation(() => mockProducer);
        producerOptions = [
            {
                name: 'orders',
                type: 'sqs',
                queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue',
            },
            {
                name: 'notifications',
                type: 'sns',
                topicArn: 'arn:aws:sns:us-east-1:123456789012:notifications-topic',
            },
        ];
        options = {
            producer: {
                config: {
                    accessKey: 'test-access-key',
                    secretKey: 'test-secret-key',
                    region: 'us-east-1',
                },
                producers: producerOptions,
            },
            serializer: mockSerializer,
            deserializer: mockDeserializer,
        };
        client = new pubsub_client_1.PubSubClient(options);
        client['serializer'] = mockSerializer;
        client['deserializer'] = mockDeserializer;
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('Constructor', () => {
        it('should create a PubSubClient instance with options', () => {
            expect(client).toBeInstanceOf(pubsub_client_1.PubSubClient);
            expect(client['options']).toBe(options);
        });
        it('should initialize producers map as empty', () => {
            expect(client.producers.size).toBe(0);
        });
    });
    describe('connect()', () => {
        it('should initialize producers successfully', async () => {
            await client.connect();
            expect(MockedProducer).toHaveBeenCalledTimes(2);
            expect(client.producers.size).toBe(2);
            expect(client.producers.has('orders')).toBe(true);
            expect(client.producers.has('notifications')).toBe(true);
        });
        it('should not create duplicate producers if already exist', async () => {
            await client.connect();
            expect(MockedProducer).toHaveBeenCalledTimes(2);
            jest.clearAllMocks();
            await client.connect();
            expect(MockedProducer).not.toHaveBeenCalled();
        });
        it('should throw error if producer options are not defined', async () => {
            const clientWithoutProducer = new pubsub_client_1.PubSubClient({
                ...options,
                producer: undefined,
            });
            await expect(clientWithoutProducer.connect()).rejects.toThrow('Producer options are not defined');
        });
    });
    describe('sendMessage()', () => {
        beforeEach(async () => {
            await client.connect();
        });
        it('should send message to SQS producer successfully', async () => {
            const pattern = 'order_created';
            const data = { orderId: 123, userId: 'user-456' };
            const options = { name: 'orders' };
            await client.sendMessage(pattern, data, options);
            expect(mockProducer.send).toHaveBeenCalledWith(expect.objectContaining({
                body: JSON.stringify(data),
                messageAttributes: {
                    pattern: {
                        DataType: 'String',
                        StringValue: pattern,
                    },
                    id: {
                        DataType: 'String',
                        StringValue: expect.any(String),
                    },
                },
                id: expect.any(String),
            }), 3);
        });
        it('should send message to SNS producer successfully', async () => {
            const pattern = 'notification_sent';
            const data = { message: 'Hello World', userId: 'user-789' };
            const options = { name: 'notifications' };
            await client.sendMessage(pattern, data, options);
            expect(mockProducer.send).toHaveBeenCalledWith(expect.objectContaining({
                body: JSON.stringify(data),
                messageAttributes: {
                    pattern: {
                        DataType: 'String',
                        StringValue: pattern,
                    },
                    id: {
                        DataType: 'String',
                        StringValue: expect.any(String),
                    },
                },
                id: expect.any(String),
            }), 3);
        });
        it('should throw error if producer not found', async () => {
            const pattern = 'test_event';
            const data = { test: 'data' };
            const options = { name: 'nonexistent' };
            await expect(client.sendMessage(pattern, data, options)).rejects.toThrow("Producer 'nonexistent' not found");
        });
        it('should generate unique message ID for each message', async () => {
            const pattern = 'test_event';
            const data = { test: 'data' };
            const options = { name: 'orders' };
            await client.sendMessage(pattern, data, options);
            await client.sendMessage(pattern, data, options);
            const calls = mockProducer.send.mock.calls;
            const firstId = calls[0][0].id;
            const secondId = calls[1][0].id;
            expect(firstId).not.toBe(secondId);
            expect(typeof firstId).toBe('string');
            expect(typeof secondId).toBe('string');
        });
    });
    describe('emit()', () => {
        beforeEach(async () => {
            await client.connect();
        });
        it('should emit message using publishUnified', async () => {
            const pattern = 'order_created';
            const data = { orderId: 123 };
            const options = { name: 'orders' };
            const result = client.emit(pattern, data, options);
            expect(result).toBeDefined();
            await result.toPromise();
            expect(mockProducer.send).toHaveBeenCalled();
        });
    });
    describe('dispatchEvent()', () => {
        beforeEach(async () => {
            await client.connect();
        });
        it('should dispatch event using publishUnified', async () => {
            const packet = {
                pattern: 'order_created',
                data: { orderId: 123 },
                options: { name: 'orders' },
            };
            await client.dispatchEvent(packet);
            expect(mockProducer.send).toHaveBeenCalledWith(expect.objectContaining({
                body: JSON.stringify(packet.data),
                messageAttributes: {
                    pattern: {
                        DataType: 'String',
                        StringValue: packet.pattern,
                    },
                    id: {
                        DataType: 'String',
                        StringValue: expect.any(String),
                    },
                },
                id: expect.any(String),
            }), 3);
        });
    });
    describe('close()', () => {
        it('should clear producers map', async () => {
            await client.connect();
            expect(client.producers.size).toBe(2);
            await client.close();
            expect(client.producers.size).toBe(0);
        });
        it('should be callable multiple times safely', async () => {
            await client.connect();
            await client.close();
            await client.close();
            expect(client.producers.size).toBe(0);
        });
    });
    describe('Error Handling', () => {
        beforeEach(async () => {
            await client.connect();
        });
        it('should handle producer send errors', async () => {
            const error = new Error('Producer send failed');
            mockProducer.send.mockRejectedValueOnce(error);
            const pattern = 'test_event';
            const data = { test: 'data' };
            const options = { name: 'orders' };
            await expect(client.sendMessage(pattern, data, options)).rejects.toThrow('Producer send failed');
        });
        it('should handle missing producer gracefully', async () => {
            const pattern = 'test_event';
            const data = { test: 'data' };
            const options = { name: 'nonexistent' };
            await expect(client.sendMessage(pattern, data, options)).rejects.toThrow("Producer 'nonexistent' not found");
        });
    });
    describe('Message Creation', () => {
        it('should create messages with correct structure', async () => {
            await client.connect();
            const pattern = 'test_event';
            const data = { test: 'data' };
            const options = { name: 'orders' };
            await client.sendMessage(pattern, data, options);
            expect(mockProducer.send).toHaveBeenCalledWith(expect.objectContaining({
                body: JSON.stringify(data),
                messageAttributes: {
                    pattern: {
                        DataType: 'String',
                        StringValue: pattern,
                    },
                    id: {
                        DataType: 'String',
                        StringValue: expect.any(String),
                    },
                },
                id: expect.any(String),
            }), 3);
        });
        it('should generate unique IDs for different messages', async () => {
            await client.connect();
            const pattern = 'test_event';
            const data = { test: 'data' };
            const options = { name: 'orders' };
            await client.sendMessage(pattern, data, options);
            await client.sendMessage(pattern, data, options);
            const calls = mockProducer.send.mock.calls;
            const firstId = calls[0][0].id;
            const secondId = calls[1][0].id;
            expect(firstId).not.toBe(secondId);
            expect(typeof firstId).toBe('string');
            expect(typeof secondId).toBe('string');
        });
    });
    describe('Producer Management', () => {
        it('should create producers with correct configuration', async () => {
            await client.connect();
            expect(MockedProducer).toHaveBeenCalledTimes(2);
            expect(MockedProducer).toHaveBeenNthCalledWith(1, producerOptions[0], options.producer.config);
            expect(MockedProducer).toHaveBeenNthCalledWith(2, producerOptions[1], options.producer.config);
        });
        it('should handle producer type configuration correctly', async () => {
            await client.connect();
            expect(client.producers.has('orders')).toBe(true);
            expect(client.producers.has('notifications')).toBe(true);
            const ordersProducer = client.producers.get('orders');
            const notificationsProducer = client.producers.get('notifications');
            expect(ordersProducer).toBeDefined();
            expect(notificationsProducer).toBeDefined();
        });
    });
});
//# sourceMappingURL=pubsub.client.spec.js.map