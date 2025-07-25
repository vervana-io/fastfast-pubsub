# NestJS AWS Pub/Sub

A NestJS microservice transport for AWS SQS and SNS with pub/sub patterns, featuring message acknowledgment, batch processing, retry logic, and SNS fan-out support.

## Features

- 🚀 **NestJS Microservice Transport** - Custom transport strategy for AWS SQS/SNS
- 📨 **Message Pattern Support** - `@MessagePattern` and `@EventPattern` decorators
- ✅ **Message Acknowledgment** - Manual `ack()`/`nack()` and auto-ack based on return values
- 🔄 **Retry Logic** - Configurable retry mechanisms for both SQS and SNS
- 📦 **Batch Processing** - Handle multiple messages in a single handler
- 🌐 **SNS Fan-out** - Support for SNS Topic → SQS fan-out patterns
- 🔧 **Cross-Service Compatibility** - Handle messages from Laravel, other NestJS services
- 📊 **Observability** - Built-in event system for monitoring
- 🛡️ **Type Safety** - Full TypeScript support

## Installation

```bash
npm install nestjs-aws-pubsub
```

## Quick Start

### 1. Configure the Microservice

```typescript
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { PubSubClient, PubSubServer } from 'nestjs-aws-pubsub';

async function bootstrap() {
  const app = await NestFactory.createMicroservice(AppModule, {
    transport: Transport.CUSTOM,
    options: {
      strategy: new PubSubServer({
        consumers: [
          {
            name: 'orders-queue',
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue',
            region: 'us-east-1',
          },
        ],
        producers: [
          {
            name: 'notifications-queue',
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/notifications-queue',
            region: 'us-east-1',
          },
        ],
        topics: [
          {
            name: 'orders',
            topicArn: 'arn:aws:sns:us-east-1:123456789012:orders-topic',
          },
        ],
        sns: {
          region: 'us-east-1',
        },
        serializer: { serialize: (value: any) => value },
        deserializer: { deserialize: (value: any) => value },
      }),
    },
  });

  await app.listen();
}
bootstrap();
```

### 2. Create Message Handlers

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, EventPattern } from '@nestjs/microservices';
import { PubSubContext } from 'nestjs-aws-pubsub';

@Controller()
export class OrdersController {
  @MessagePattern('order_created')
  async handleOrderCreated(data: any, context: PubSubContext) {
    console.log('Processing order:', data);
    
    // Auto-ack: return true to acknowledge, false to reject
    return true;
  }

  @EventPattern('order_approved')
  async handleOrderApproved(data: any, context: PubSubContext) {
    console.log('Order approved:', data);
    
    // Manual acknowledgment
    await context.ack();
  }

  @MessagePattern('batch_orders')
  async handleBatchOrders(batch: Array<{ data: any; context: SQSContext }>) {
    console.log('Processing batch of orders:', batch.length);
    
    for (const { data, context } of batch) {
      // Process each message
      await context.ack();
    }
  }
}
```

### 3. Send Messages

```typescript
import { Injectable } from '@nestjs/common';
import { SQSClient } from 'nestjs-aws-pubsub';

@Injectable()
export class OrdersService {
  constructor(private readonly sqsClient: PubSubClient) {}

  async createOrder(orderData: any) {
    // Send to SQS queue
    await this.sqsClient.sendMessage('order_created', orderData, {
      queueName: 'orders-queue',
    });

    // Send to SNS topic (fan-out to multiple SQS queues)
    await this.sqsClient.sendMessage('order_approved', orderData, {
      topic: 'orders',
    });

    // Use emit for fire-and-forget
    this.sqsClient.emit('order_notification', orderData, {
      topic: 'notifications',
    });
  }
}
```

## Configuration Options

### SQS Server Options

```typescript
interface SqsOptions {
  // Consumer configurations
  consumer?: SqsConsumerOptions;
  consumers?: SqsConsumerOptions[];
  
  // Producer configurations
  producer?: SqsProducerOptions;
  producers?: SqsProducerOptions[];
  
  // SNS configuration
  topics?: Array<{ name: string; topicArn: string }>;
  sns?: any; // AWS SNS client configuration
  
  // Environment scoping
  scopedEnvKey?: string;
  
  // Serialization
  serializer: Serializer;
  deserializer: Deserializer;
  
  // Logging
  logger?: LoggerService;
  
  // Graceful shutdown
  globalStopOptions?: StopOptions;
}
```

### Consumer Options

```typescript
interface SqsConsumerOptions {
  name: string;
  queueUrl: string;
  region?: string;
  credentials?: any;
  stopOptions?: StopOptions;
  // ... other sqs-consumer options
}
```

## Advanced Features

### Batch Processing

```typescript
import { PubSubMessagePattern } from 'nestjs-aws-pubsub';

@Controller()
export class BatchController {
  @PubSubMessagePattern('batch_orders', { batch: true })
  async handleBatchOrders(batch: Array<{ data: any; context: PubSubContext }>) {
    // Process multiple messages at once
    for (const { data, context } of batch) {
      await this.processOrder(data);
      await context.ack();
    }
  }
}
```

### SNS Fan-out Support

The library automatically handles SNS envelope unwrapping for messages sent via SNS Topic → SQS fan-out:

```typescript
// Messages sent to SNS topics will be automatically unwrapped
@MessagePattern('order_created')
async handleOrderCreated(data: any, context: SQSContext) {
  // This will work for messages sent directly to SQS
  // AND for messages sent via SNS fan-out
  console.log('Processing order:', data);
  return true;
}
```

### Cross-Service Compatibility

Handle messages from non-NestJS services (e.g., Laravel):

```typescript
// Laravel sends: { "pattern": "order_created", "data": {...} }
// NestJS automatically extracts pattern and data
@MessagePattern('order_created')
async handleOrderCreated(data: any, context: SQSContext) {
  // Works seamlessly with Laravel or any other service
  return true;
}
```

### Event Observability

```typescript
// Listen to internal events
sqsServer.on('message_received', (message) => {
  console.log('Message received:', message);
});

sqsServer.on('message_processed', (message) => {
  console.log('Message processed:', message);
});

sqsServer.on('processing_error', () => {
  console.log('Error processing message');
});
```

## API Reference

### SQSContext

```typescript
class SQSContext {
  getMessage(): any;           // Get raw SQS message
  getPattern(): string;        // Get message pattern
  ack(): Promise<void>;        // Manually acknowledge message
  nack(): Promise<void>;       // Manually reject message
}
```

### SQSClient

```typescript
class SQSClient extends ClientProxy {
  // Send message to SQS or SNS
  sendMessage<T>(
    pattern: string,
    data: T,
    options?: {
      queueName?: string;
      topic?: string;
      topicArn?: string;
      type?: 'sqs' | 'sns';
    }
  ): Promise<void>;

  // Emit event (fire-and-forget)
  emit<TInput>(
    pattern: string,
    data: TInput,
    options?: { /* same as sendMessage */ }
  ): Observable<any>;

  // Dispatch event
  dispatchEvent(packet: any): Promise<any>;
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License. 