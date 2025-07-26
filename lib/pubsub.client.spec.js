"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pubsub_client_1 = require("./pubsub.client");
const client_sns_1 = require("@aws-sdk/client-sns");
const sqs_producer_1 = require("sqs-producer");
jest.mock('sqs-producer');
jest.mock('@aws-sdk/client-sns', () => {
    const SNSClient = jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue('sns-sent'),
    }));
    const PublishCommand = jest.fn().mockImplementation((params) => params);
    return { SNSClient, PublishCommand };
});
describe('PubSubClient', () => {
    let client;
    let mockProducerSend;
    let mockSNSPublish;
    let options;
    let callCount;
    beforeEach(() => {
        callCount = 0;
        mockProducerSend = jest.fn().mockResolvedValue('sent');
        sqs_producer_1.Producer.create.mockReturnValue({ send: mockProducerSend });
        mockSNSPublish = jest.fn().mockResolvedValue('sns-sent');
        client_sns_1.SNSClient.mockImplementation(() => ({ send: mockSNSPublish }));
        options = {
            producers: [{ name: 'orders', queueUrl: 'dummy-url' }],
            topics: [
                { name: 'orders', topicArn: 'arn:aws:sns:us-east-1:000000000000:orders' },
                { name: 'notifications', topicArn: 'arn:aws:sns:us-east-1:000000000000:notifications' },
            ],
            sns: {},
            serializer: { serialize: (v) => v },
            deserializer: { deserialize: (v) => v },
            logger: console,
        };
        client = new pubsub_client_1.PubSubClient(options);
        client['producers'].set('orders', { send: mockProducerSend });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should send to SQS if queueName is provided', async () => {
        await client.sendMessage('order_created', { orderId: 123 }, { queueName: 'orders' });
        expect(mockProducerSend).toHaveBeenCalled();
        expect(mockSNSPublish).not.toHaveBeenCalled();
    });
    it('should send to SNS if topic is provided', async () => {
        await client.sendMessage('order_created', { orderId: 123 }, { topic: 'orders' });
        expect(mockSNSPublish).toHaveBeenCalled();
        expect(mockProducerSend).not.toHaveBeenCalled();
    });
    it('should send to SNS if topicArn is provided', async () => {
        await client.sendMessage('order_created', { orderId: 123 }, { topicArn: 'arn:aws:sns:us-east-1:000000000000:orders' });
        expect(mockSNSPublish).toHaveBeenCalled();
        expect(mockProducerSend).not.toHaveBeenCalled();
    });
    it('should send to SNS using default topic if no destination is provided', async () => {
        await client.sendMessage('order_created', { orderId: 123 });
        expect(mockSNSPublish).toHaveBeenCalled();
        expect(mockProducerSend).not.toHaveBeenCalled();
    });
    it('should retry SNS publish on failure and succeed', async () => {
        const error = new Error('SNS fail');
        let callCount = 0;
        const mockSend = jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.reject(error);
            }
            return Promise.resolve('sns-sent');
        });
        client['snsClient'] = { send: mockSend };
        await expect(client.sendMessage('order_created', { orderId: 123 }, { topic: 'orders' })).resolves.toBeUndefined();
        expect(callCount).toBe(2);
    });
    it('should retry SQS send on failure', async () => {
        mockProducerSend
            .mockRejectedValueOnce(new Error('fail1'))
            .mockResolvedValueOnce('sent');
        await client.sendMessage('order_created', { orderId: 123 }, { queueName: 'orders' });
        expect(mockProducerSend).toHaveBeenCalledTimes(2);
    });
    it('should use emit for SNS', async () => {
        await client.emit('order_created', { orderId: 123 }, { topic: 'orders' }).toPromise();
        expect(mockSNSPublish).toHaveBeenCalled();
    });
    it('should use emit for SQS', async () => {
        await client.emit('order_created', { orderId: 123 }, { queueName: 'orders' }).toPromise();
        expect(mockProducerSend).toHaveBeenCalled();
    });
    it('should use dispatchEvent for SNS', async () => {
        await client.dispatchEvent({ pattern: 'order_created', data: { orderId: 123 }, options: { topic: 'orders' } });
        expect(mockSNSPublish).toHaveBeenCalled();
    });
    it('should use dispatchEvent for SQS', async () => {
        await client.dispatchEvent({ pattern: 'order_created', data: { orderId: 123 }, options: { queueName: 'orders' } });
        expect(mockProducerSend).toHaveBeenCalled();
    });
    it('should fallback to SNS if no queueName and no topic is provided', async () => {
        await client.sendMessage('order_created', { orderId: 123 });
        expect(mockSNSPublish).toHaveBeenCalled();
    });
    it('should throw error if SNS publish fails after retries', async () => {
        const error = new Error('SNS fail');
        let callCount = 0;
        const mockSend = jest.fn().mockImplementation(() => {
            callCount++;
            return Promise.reject(error);
        });
        client['snsClient'] = { send: mockSend };
        await expect(client.sendMessage('order_created', { orderId: 123 }, { topic: 'orders' })).rejects.toThrow('SNS fail');
        expect(callCount).toBe(client['maxRetries'] + 1);
    });
});
//# sourceMappingURL=pubsub.client.spec.js.map