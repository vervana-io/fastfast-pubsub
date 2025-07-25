import { Test, TestingModule } from '@nestjs/testing';
import { INestMicroservice } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';
import { SQSServer } from '../lib/sqs.server';
import { SQS } from 'aws-sdk';
import { AppModule } from '../src/app.module';

// Global flag for test assertion
(global as any).orderApprovedCalled = false;

// Example handler in your AppModule (for demonstration)
// In your real app, set this flag in your handler:
// @MessagePattern('order_approved')
// async handleOrderApproved(@Payload() data: any, @Ctx() context: SQSContext) {
//   (global as any).orderApprovedCalled = true;
//   await context.ack();
// }

describe('SQS E2E', () => {
  let app: INestMicroservice;
  let sqs: SQS;
  const queueUrl = 'http://localhost:4566/000000000000/my-queue';

  beforeAll(async () => {
    sqs = new SQS({
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestMicroservice<MicroserviceOptions>({
      strategy: new SQSServer({
        consumers: [{ name: 'my-queue', queueUrl }],
        serializer: { serialize: (v) => v },
        deserializer: { deserialize: (v) => v },
        logger: console,
      }),
    });

    await app.listen();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should process a message sent to SQS', async (done) => {
    // Reset the global flag
    (global as any).orderApprovedCalled = false;

    // Send a message to SQS
    await sqs
      .sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ orderId: 123, pattern: 'order_approved' }),
      })
      .promise();

    // Wait for the handler to process the message
    setTimeout(() => {
      expect((global as any).orderApprovedCalled).toBe(true);
      done();
    }, 2000);
  });
}); 