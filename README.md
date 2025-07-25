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
import { AppModule } from './app.module';
import { PubSubServer } from 'nestjs-aws-pubsub';

async function bootstrap() {
  const app = await NestFactory.createMicroservice(AppModule, {
    strategy: new PubSubServer({
        // Consumer configurations
        consumers: [
          {
            name: 'orders-queue',
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue',
            region: 'us-east-1',
          },
          {
            name: 'notifications-queue',
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/notifications-queue',
            region: 'us-east-1',
          },
        ],
        
        // Producer configurations
        producers: [
          {
            name: 'orders-producer',
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue',
            region: 'us-east-1',
          },
        ],
        
        // SNS configuration
        topics: [
          {
            name: 'orders',
            topicArn: 'arn:aws:sns:us-east-1:123456789012:orders-topic',
          },
          {
            name: 'notifications',
            topicArn: 'arn:aws:sns:us-east-1:123456789012:notifications-topic',
          },
        ],
        sns: {
          region: 'us-east-1',
        },
        
        // Serialization
        serializer: { serialize: (value: any) => value },
        deserializer: { deserialize: (value: any) => value },
        
        // Environment scoping (optional)
        scopedEnvKey: 'PROD',
      }),
  });

  // Listen to internal events for observability
  const pubSubServer = app.get(PubSubServer);
  pubSubServer.on('message_received', (message) => {
    console.log('Message received:', message.MessageId);
  });

  pubSubServer.on('message_processed', (message) => {
    console.log('Message processed:', message.MessageId);
  });

  pubSubServer.on('processing_error', () => {
    console.log('Error processing message');
  });

  await app.listen();
}
bootstrap();
```

### 2. Create Message Handlers

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, EventPattern } from '@nestjs/microservices';
import { PubSubContext, PubSubMessagePattern } from 'nestjs-aws-pubsub';

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

  @PubSubMessagePattern('batch_orders', { batch: true })
  async handleBatchOrders(batch: Array<{ data: any; context: PubSubContext }>) {
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
import { PubSubClient } from 'nestjs-aws-pubsub';

@Injectable()
export class OrdersService {
  constructor(private readonly pubSubClient: PubSubClient) {}

  async createOrder(orderData: any) {
    // Send to SQS queue
    await this.pubSubClient.sendMessage('order_created', orderData, {
      queueName: 'orders-queue',
    });

    // Send to SNS topic (fan-out to multiple SQS queues)
    await this.pubSubClient.sendMessage('order_approved', orderData, {
      topic: 'orders',
    });

    // Use emit for fire-and-forget
    this.pubSubClient.emit('order_notification', orderData, {
      topic: 'notifications',
    });
  }
}
```

## Configuration Options

### PubSubOptions

```typescript
interface PubSubOptions {
  // Consumer configurations
  consumer?: PubSubConsumerOptions;
  consumers?: PubSubConsumerOptions[];
  
  // Producer configurations
  producer?: PubSubProducerOptions;
  producers?: PubSubProducerOptions[];
  
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
interface PubSubConsumerOptions {
  name: string;
  queueUrl: string;
  region?: string;
  credentials?: any;
  stopOptions?: StopOptions;
  // ... other sqs-consumer options
}
```

### Producer Options

```typescript
interface PubSubProducerOptions {
  name: string;
  queueUrl: string;
  region?: string;
  credentials?: any;
  // ... other sqs-producer options
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
async handleOrderCreated(data: any, context: PubSubContext) {
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
async handleOrderCreated(data: any, context: PubSubContext) {
  // Works seamlessly with Laravel or any other service
  return true;
}
```

### Event Observability

```typescript
// Listen to internal events
pubSubServer.on('message_received', (message) => {
  console.log('Message received:', message);
});

pubSubServer.on('message_processed', (message) => {
  console.log('Message processed:', message);
});

pubSubServer.on('processing_error', () => {
  console.log('Error processing message');
});
```

## API Reference

### PubSubContext

```typescript
class PubSubContext {
  getMessage(): any;           // Get raw SQS message
  getPattern(): string;        // Get message pattern
  ack(): Promise<void>;        // Manually acknowledge message
  nack(): Promise<void>;       // Manually reject message
}
```

### PubSubClient

```typescript
class PubSubClient extends ClientProxy {
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

### PubSubMessagePattern Decorator

```typescript
function PubSubMessagePattern(
  pattern: string, 
  options?: {
    batch?: boolean;
    retry?: number;
  }
)
```

## Usage from Another Service

```typescript
import { PubSubClient } from 'nestjs-aws-pubsub';

async function sendMessageExample() {
  const client = new PubSubClient({
    producers: [
      {
        name: 'orders-producer',
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue',
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
  });

  // Send to SQS
  await client.sendMessage('order_created', { 
    orderId: '123', 
    customerId: '456',
    amount: 99.99 
  }, { 
    queueName: 'orders-queue' 
  });

  // Send to SNS (fan-out)
  await client.sendMessage('order_approved', { 
    orderId: '123' 
  }, { 
    topic: 'orders' 
  });

  // Emit event
  client.emit('order_notification', { 
    orderId: '123',
    status: 'approved' 
  }, { 
    topic: 'notifications' 
  });
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