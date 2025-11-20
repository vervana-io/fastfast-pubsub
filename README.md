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
- 🌍 **Global Module** - Easy integration with automatic connection management
- ⚡ **Zero Boilerplate** - No manual connection calls needed

## Installation

```bash
npm install nestjs-aws-pubsub
```

## Quick Start

### 1. Configure the Global Module (Recommended)

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PubSubModule } from 'nestjs-aws-pubsub';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PubSubModule.forRoot({
      producer: {
        config: {
          accessKey: process.env.AWS_ACCESS_KEY_ID,
          secretKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1',
        },
        producers: [
          {
            name: 'orders',
            type: 'sqs',
            queueUrl: process.env.SQS_ORDERS_QUEUE_URL,
          },
          {
            name: 'notifications',
            type: 'sns',
            topicArn: process.env.SNS_NOTIFICATIONS_TOPIC_ARN,
          },
        ],
      },
      serializer: { serialize: (value: any) => value },
      deserializer: { deserialize: (value: any) => value },
    }),
  ],
})
export class AppModule {}
```

### 2. Use the Client in Your Services

```typescript
// orders.service.ts
import { Injectable } from '@nestjs/common';
import { PubSubClient } from 'nestjs-aws-pubsub';

@Injectable()
export class OrdersService {
  constructor(private readonly pubSubClient: PubSubClient) {}

  async createOrder(orderData: any) {
    // ✅ No connection needed - client is automatically ready!
    
    // Send to SQS queue
    await this.pubSubClient.sendMessage('order_created', orderData, { name: 'orders' });
    
    // Send to SNS topic
    await this.pubSubClient.sendMessage('notification_sent', { 
      message: 'Order created successfully' 
    }, { name: 'notifications' });
  }

  async emitOrderEvent(eventData: any) {
    // Use Observable-based emission
    await this.pubSubClient.emit('order_event', eventData, { name: 'orders' }).toPromise();
  }
}
```

### 3. Async Configuration (Environment-based)

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PubSubModule } from 'nestjs-aws-pubsub';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PubSubModule.forRootAsync({
      useFactory: async (configService: ConfigService) => ({
        producer: {
          config: {
            accessKey: configService.get<string>('AWS_ACCESS_KEY_ID'),
            secretKey: configService.get<string>('AWS_SECRET_ACCESS_KEY'),
            region: configService.get<string>('AWS_REGION'),
            endpoint: configService.get<string>('AWS_ENDPOINT'), // for local development
          },
          producers: [
            {
              name: 'orders',
              type: 'sqs',
              queueUrl: configService.get<string>('SQS_ORDERS_QUEUE_URL'),
            },
            {
              name: 'payments',
              type: 'sqs',
              queueUrl: configService.get<string>('SQS_PAYMENTS_QUEUE_URL'),
            },
            {
              name: 'notifications',
              type: 'sns',
              topicArn: configService.get<string>('SNS_NOTIFICATIONS_TOPIC_ARN'),
            },
          ],
        },
        serializer: { serialize: (v: any) => v },
        deserializer: { deserialize: (v: any) => v },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### 4. Environment Variables

```bash
# .env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
AWS_ENDPOINT=http://localhost:4566  # for LocalStack development

# SQS Queues
SQS_ORDERS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue
SQS_PAYMENTS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/payments-queue

# SNS Topics
SNS_NOTIFICATIONS_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:notifications-topic
```

## Server-Side Configuration (Microservice)

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

## Configuration Options

### PubSubOptions

```typescript
interface PubSubOptions {
  // Producer configurations (for sending messages)
  producer?: PubSubProducerOptions;
  
  // Consumer configurations (for receiving messages - server only)
  consumer?: PubSubConsumerOptions;
  consumers?: PubSubConsumerOptions[];
  
  // Serialization
  serializer: Serializer;
  deserializer: Deserializer;
  
  // Logging
  logger?: LoggerService;
  
  // Graceful shutdown
  globalStopOptions?: StopOptions;
  
  // Environment scoping
  scopedEnvKey?: string;
}
```

### Producer Options

```typescript
interface PubSubProducerOptions {
  config: {
    accessKey: string;
    secretKey: string;
    region?: string;
    endpoint?: string;
    sns?: SNSClient;
    sqs?: SQSClient;
  };
  producers: Array<PubSubSQSProducerOption | PubSubSNSProducerOption>;
}

interface PubSubSQSProducerOption {
  name: string;
  type: 'sqs';
  queueUrl: string;
  queueName?: string;
  sqsConfig?: SQSClientConfig;
  sqs?: SQSClient;
}

interface PubSubSNSProducerOption {
  name: string;
  type: 'sns';
  topicArn: string;
  topicName?: string;
  snsConfig?: SNSClientConfig;
  sns?: SNSClient;
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
    options: { name: string }
  ): Promise<void>;

  // Emit event (fire-and-forget)
  emit<TInput>(
    pattern: string,
    data: TInput,
    options?: { name: string }
  ): Observable<any>;

  // Dispatch event
  dispatchEvent(packet: any): Promise<any>;

  // Get available producers
  readonly producers: Map<string, Producer>;

  // Close connections
  close(): Promise<void>;
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

## Usage Examples

### Basic Message Sending

```typescript
@Injectable()
export class NotificationService {
  constructor(private readonly pubSubClient: PubSubClient) {}

  async sendWelcomeEmail(userData: any) {
    await this.pubSubClient.sendMessage('welcome_email', userData, { name: 'notifications' });
  }

  async sendOrderConfirmation(orderData: any) {
    await this.pubSubClient.sendMessage('order_confirmation', orderData, { name: 'orders' });
  }
}
```

### Event Emission

```typescript
@Injectable()
export class EventService {
  constructor(private readonly pubSubClient: PubSubClient) {}

  async emitUserRegistered(userData: any) {
    // Fire-and-forget event
    await this.pubSubClient.emit('user_registered', userData, { name: 'notifications' }).toPromise();
  }
}
```

### Batch Operations

```typescript
@Injectable()
export class BatchService {
  constructor(private readonly pubSubClient: PubSubClient) {}

  async processMultipleOrders(orders: any[]) {
    for (const order of orders) {
      await this.pubSubClient.sendMessage('order_processed', order, { name: 'orders' });
    }
  }
}
```

## Standalone Usage (Without NestJS Module)

```typescript
import { PubSubClient } from 'nestjs-aws-pubsub';

async function sendMessageExample() {
  const client = new PubSubClient({
    producer: {
      config: {
        accessKey: 'your-access-key',
        secretKey: 'your-secret-key',
        region: 'us-east-1',
      },
      producers: [
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
      ],
    },
    serializer: { serialize: (value: any) => value },
    deserializer: { deserialize: (value: any) => value },
  });

  // Connect manually when not using the module
  await client.connect();

  // Send to SQS
  await client.sendMessage('order_created', { 
    orderId: '123', 
    customerId: '456',
    amount: 99.99 
  }, { name: 'orders' });

  // Send to SNS (fan-out)
  await client.sendMessage('order_approved', { 
    orderId: '123' 
  }, { name: 'notifications' });

  // Clean up
  await client.close();
}
```

## Advanced Usage

### Custom Providers and Injection Tokens

You can also use the `PUBSUB_OPTIONS` token directly for custom providers:

```typescript
import { Module } from '@nestjs/common';
import { PUBSUB_OPTIONS, PubSubModule } from 'nestjs-aws-pubsub';

@Module({
  providers: [
    {
      provide: PUBSUB_OPTIONS,
      useValue: {
        producer: {
          config: {
            accessKey: 'custom-key',
            secretKey: 'custom-secret',
            region: 'us-east-1',
          },
          producers: [
            {
              name: 'custom-queue',
              type: 'sqs',
              queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/custom-queue',
            },
          ],
        },
        serializer: { serialize: (v: any) => v },
        deserializer: { deserialize: (v: any) => v },
      },
    },
    PubSubClient,
  ],
  exports: [PubSubClient],
})
export class CustomPubSubModule {}
```

### Using the Options Token in Services

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { PUBSUB_OPTIONS, PubSubOptions } from 'nestjs-aws-pubsub';

@Injectable()
export class ConfigService {
  constructor(@Inject(PUBSUB_OPTIONS) private pubSubOptions: PubSubOptions) {}

  getProducerConfig() {
    return this.pubSubOptions.producer;
  }
}
```

## Troubleshooting

### Server Not Picking Up Messages

If your `PubSubServer` is not picking up messages, here are the most common issues and solutions:

#### 1. **Check Consumer Configuration**
```typescript
// Make sure your consumer options are correct
const options = {
  consumers: [
    {
      name: 'orders-queue',           // ✅ Required: Unique name
      queueUrl: 'https://sqs...',     // ✅ Required: Full SQS queue URL
      region: 'us-east-1',            // ✅ Required: AWS region
    }
  ],
  // ... other options
};
```

#### 2. **Verify Queue URL and Permissions**
- Ensure the queue URL is correct and accessible
- Check that your AWS credentials have `sqs:ReceiveMessage` permissions
- Verify the queue exists and is not empty

#### 3. **Check Message Format**
Your messages must include a `pattern` either in:
- **Message Attributes** (recommended for NestJS):
```json
{
  "MessageAttributes": {
    "pattern": {
      "DataType": "String",
      "StringValue": "order_created"
    }
  },
  "Body": "{\"orderId\": 123}"
}
```

- **Message Body** (for Laravel/other services):
```json
{
  "Body": "{\"pattern\": \"order_created\", \"orderId\": 123}"
}
```

#### 4. **Enable Debug Logging**
```typescript
const server = new PubSubServer({
  consumers: [/* your config */],
  logger: console, // Use console for detailed logging
});

// Add event listeners
server.on('message_received', (message) => {
  console.log('Message received:', message.MessageId);
});

server.on('error', (error) => {
  console.error('Server error:', error);
});
```

#### 5. **Check Server Status**
```typescript
// After starting the server
console.log('Server status:', server.getStatus());
```

#### 6. **Common Issues and Solutions**

| Issue | Cause | Solution |
|-------|-------|----------|
| No messages received | Queue URL incorrect | Verify queue URL and region |
| Messages received but not processed | Missing pattern | Ensure pattern in attributes or body |
| Consumer not starting | AWS credentials | Check IAM permissions |
| Messages stuck in queue | Handler errors | Check handler implementation |

#### 7. **Debug Script**
Use the included debug script to test your setup:
```bash
# Update the queue URL in debug-server.js
node debug-server.js
```

### Client Not Sending Messages

If your `PubSubClient` is not sending messages:

#### 1. **Check Producer Configuration**
```typescript
const options = {
  producer: {
    config: {
      accessKey: process.env.AWS_ACCESS_KEY_ID,     // ✅ Required
      secretKey: process.env.AWS_SECRET_ACCESS_KEY, // ✅ Required
      region: process.env.AWS_REGION,               // ✅ Required
    },
    producers: [
      {
        name: 'orders',                    // ✅ Required: Unique name
        type: 'sqs',                       // ✅ Required: 'sqs' or 'sns'
        queueUrl: 'https://sqs...',        // ✅ Required for SQS
        // OR
        topicArn: 'arn:sns...',            // ✅ Required for SNS
      }
    ]
  }
};
```

#### 2. **Verify AWS Credentials**
- Check environment variables
- Ensure credentials have proper permissions
- Test with AWS CLI first

#### 3. **Check Message Format**
```typescript
// Make sure you're using the correct producer name
await client.sendMessage('order_created', data, { name: 'orders' });
```

## Testing

```typescript
// In your test files
import { Test, TestingModule } from '@nestjs/testing';
import { PubSubModule } from 'nestjs-aws-pubsub';

describe('OrdersService', () => {
  let service: OrdersService;
  let pubSubClient: PubSubClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PubSubModule.forRoot({
          producer: {
            config: {
              accessKey: 'test',
              secretKey: 'test',
              region: 'us-east-1',
            },
            producers: [
              {
                name: 'test-orders',
                type: 'sqs',
                queueUrl: 'http://localhost:4566/000000000000/test-queue',
              },
            ],
          },
          serializer: { serialize: (v: any) => v },
          deserializer: { deserialize: (v: any) => v },
        }),
      ],
      providers: [OrdersService],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    pubSubClient = module.get<PubSubClient>(PubSubClient);
  });

  it('should send order message', async () => {
    const sendSpy = jest.spyOn(pubSubClient, 'sendMessage');
    
    await service.createOrder({ orderId: '123' });
    
    expect(sendSpy).toHaveBeenCalledWith(
      'order_created',
      { orderId: '123' },
      { name: 'test-orders' }
    );
  });
});
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License. 