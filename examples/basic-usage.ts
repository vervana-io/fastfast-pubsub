/**
 * Basic Usage Example for nestjs-aws-pubsub
 * 
 * This example shows how to set up a NestJS microservice using AWS SQS/SNS
 * with message handlers, client usage, and configuration.
 */

import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { Controller, Injectable, Module } from '@nestjs/common';
import { MessagePattern, EventPattern } from '@nestjs/microservices';
import { 
  PubSubServer, 
  PubSubClient, 
  PubSubContext, 
  PubSubMessagePattern 
} from 'nestjs-aws-pubsub';

// ============================================================================
// 1. MESSAGE HANDLERS
// ============================================================================

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

// ============================================================================
// 2. SERVICE USING CLIENT
// ============================================================================

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

// ============================================================================
// 3. MODULE SETUP
// ============================================================================

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class AppModule {}

// ============================================================================
// 4. MICROSERVICE BOOTSTRAP
// ============================================================================

async function bootstrap() {
  const app = await NestFactory.createMicroservice(AppModule, {
    transport: Transport.CUSTOM,
    options: {
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
    },
  });

  // Listen to internal events for observability
  const sqsServer = app.get(PubSubServer);
  sqsServer.on('message_received', (message) => {
    console.log('Message received:', message.MessageId);
  });

  sqsServer.on('message_processed', (message) => {
    console.log('Message processed:', message.MessageId);
  });

  sqsServer.on('processing_error', () => {
    console.log('Error processing message');
  });

  await app.listen();
  console.log('Microservice is listening');
}

// ============================================================================
// 5. USAGE FROM ANOTHER SERVICE
// ============================================================================

// In another NestJS application or service:
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

// Run the microservice
if (require.main === module) {
  bootstrap().catch(console.error);
} 