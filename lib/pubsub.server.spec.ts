import { PubSubServer } from './pubsub.server';
import { PubSubContext } from './pubsub.context';
import { PUBSUB_HANDLER_OPTIONS } from './pubsub.decorator';
import { Reflector } from '@nestjs/core';

describe('PubSubServer deserialization and handler routing', () => {
  let server: PubSubServer;
  let mockHandler: jest.Mock;
  let mockBatchHandler: jest.Mock;

  beforeEach(() => {
    server = new PubSubServer({
      consumers: [{ name: 'test', queueUrl: 'dummy-url' }],
      serializer: { serialize: (v: any) => v },
      deserializer: { deserialize: (v: any) => v },
      logger: console,
    });
    mockHandler = jest.fn();
    mockBatchHandler = jest.fn();
    jest.spyOn(server as any, 'getHandlerByPattern').mockImplementation((...args: unknown[]) => {
      const pattern = args[0];
      if (pattern === 'order_approved') return mockHandler;
      if (pattern === 'batch_pattern') return mockBatchHandler;
      return undefined;
    });
    // Patch reflector for batch handler
    (server as any).reflector = new Reflector();
    jest.spyOn((server as any).reflector, 'get').mockImplementation((key, handler) => {
      if (handler === mockBatchHandler) return { batch: true };
      return {};
    });
  });

  it('should extract pattern from message attributes', async () => {
    const message = {
      body: JSON.stringify({ orderId: 123 }),
      messageAttributes: {
        pattern: { StringValue: 'order_approved' },
        id: { StringValue: 'abc123' },
      },
    };
    await server.handleMessage(message);
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 123 }),
      expect.any(PubSubContext)
    );
  });

  it('should extract pattern from body if not in attributes', async () => {
    const message = {
      body: JSON.stringify({ orderId: 123, pattern: 'order_approved', id: 'abc123' }),
      messageAttributes: {},
    };
    await server.handleMessage(message);
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 123, pattern: 'order_approved', id: 'abc123' }),
      expect.any(PubSubContext)
    );
  });

  it('should unwrap SNS envelope and extract pattern', async () => {
    const snsEnvelope = {
      Type: 'Notification',
      Message: JSON.stringify({ orderId: 123, pattern: 'order_approved', id: 'abc123' }),
    };
    const message = {
      body: JSON.stringify(snsEnvelope),
      messageAttributes: {},
    };
    await server.handleMessage(message);
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 123, pattern: 'order_approved', id: 'abc123' }),
      expect.any(PubSubContext)
    );
  });

  it('should call batch handler if batch option is set', async () => {
    const message = {
      body: JSON.stringify({ foo: 'bar', pattern: 'batch_pattern', id: 'batch1' }),
      messageAttributes: {},
    };
    await server.handleMessage(message);
    expect(mockBatchHandler).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ data: expect.objectContaining({ foo: 'bar', pattern: 'batch_pattern', id: 'batch1' }), context: expect.any(PubSubContext) })
      ])
    );
  });

  it('should ack if handler returns true', async () => {
    mockHandler.mockResolvedValue(true);
    const contextAck = jest.spyOn(PubSubContext.prototype, 'ack').mockResolvedValue(undefined);
    const message = {
      body: JSON.stringify({ orderId: 123, pattern: 'order_approved', id: 'abc123' }),
      messageAttributes: {},
    };
    await server.handleMessage(message);
    expect(contextAck).toHaveBeenCalled();
  });

  it('should nack if handler returns false', async () => {
    mockHandler.mockResolvedValue(false);
    const contextNack = jest.spyOn(PubSubContext.prototype, 'nack').mockResolvedValue(undefined);
    const message = {
      body: JSON.stringify({ orderId: 123, pattern: 'order_approved', id: 'abc123' }),
      messageAttributes: {},
    };
    await server.handleMessage(message);
    expect(contextNack).toHaveBeenCalled();
  });
}); 