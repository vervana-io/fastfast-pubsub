"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Producer = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_sns_1 = require("@aws-sdk/client-sns");
const error_1 = require("./error");
const common_1 = require("@nestjs/common");
class Producer {
    constructor(options, config) {
        this.options = options;
        this.logger = new common_1.Logger(Producer.name);
        this.maxRetries = 3;
        this.setup(options, config);
    }
    setup(option, config) {
        if (option.type == 'sqs') {
            this.sqs = option.sqs || option.sqsConfig ? new client_sqs_1.SQSClient(option.sqsConfig) : new client_sqs_1.SQSClient({
                endpoint: config.endpoint || undefined,
                region: config.region,
                credentials: {
                    secretAccessKey: config.secretKey,
                    accessKeyId: config.accessKey,
                },
            });
        }
        if (option.type == 'sns') {
            this.sns = option.sns || option.snsConfig ? new client_sns_1.SNSClient(option.snsConfig) : new client_sns_1.SNSClient({
                endpoint: config.endpoint || undefined,
                region: config.region,
                credentials: {
                    secretAccessKey: config.secretKey,
                    accessKeyId: config.accessKey,
                },
            });
        }
    }
    send(message, retries = this.maxRetries) {
        if (this.options.type == 'sqs') {
            return this.sendMessageWithRetry(this.options.queueUrl, message, retries);
        }
        return this.publicMessage(this.options.topicArn, message, retries);
    }
    async publishSnsWithRetry(topicArn, data, retries = this.maxRetries) {
        try {
            const command = new client_sns_1.PublishCommand({
                TopicArn: topicArn,
                Message: data.body,
                MessageAttributes: data.messageAttributes,
            });
            await this.sns.send(command);
        }
        catch (error) {
            if (retries <= 0) {
                this.logger.log(`Failed to publish message to SNS after retries: ${error.message}`, 'error');
                throw error;
            }
            this.logger.log(`Error publishing message to SNS, retrying (${this.maxRetries - retries + 1}/${this.maxRetries}): ${error.message}`, 'error');
            return this.publishSnsWithRetry(topicArn, data, retries - 1);
        }
    }
    async sendSQSBatch(queueUrl, failedMessages, successfulMessages, messages, startIndex) {
        const endIndex = startIndex + this.batchSize;
        const batch = messages.slice(startIndex, endIndex);
        const command = new client_sqs_1.SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: batch,
        });
        const result = await this.sqs.send(command);
        const failedMessagesBatch = failedMessages.concat(result?.Failed?.map((entry) => entry.Id) || []);
        const successfulMessagesBatch = successfulMessages.concat(result?.Successful || []);
        if (endIndex < messages.length) {
            return this.sendSQSBatch(queueUrl, failedMessagesBatch, successfulMessagesBatch, messages, endIndex);
        }
        if (failedMessagesBatch.length === 0) {
            return successfulMessagesBatch;
        }
        throw new error_1.FailedBatchMessagesError(failedMessagesBatch);
    }
    async sendSNSBatch(topicArn, failedMessages, successfulMessages, messages, startIndex) {
        const endIndex = startIndex + this.batchSize;
        const batch = messages.slice(startIndex, endIndex);
        const cmd = new client_sns_1.PublishBatchCommand({
            TopicArn: topicArn,
            PublishBatchRequestEntries: batch
        });
        const result = await this.sns.send(cmd);
        const failedMessagesBatch = failedMessages.concat(result?.Failed?.map((entry) => entry.Id) || []);
        const successfulMessagesBatch = successfulMessages.concat(result?.Successful || []);
        if (endIndex < messages.length) {
            return this.sendSNSBatch(topicArn, failedMessagesBatch, successfulMessagesBatch, messages, endIndex);
        }
        if (failedMessagesBatch.length === 0) {
            return successfulMessagesBatch;
        }
        throw new error_1.FailedBatchMessagesError(failedMessagesBatch);
    }
    async sendMessageWithRetry(queueUrl, message, retries) {
        message = Array.isArray(message) ? message[0] : message;
        try {
            const command = new client_sqs_1.SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: message.body,
                MessageAttributes: message.messageAttributes,
                MessageGroupId: message.groupId,
                MessageDeduplicationId: message.deduplicationId,
                DelaySeconds: message.delaySeconds,
            });
            const result = await this.sqs.send(command);
            this.logger.log(`Producer send result: ${JSON.stringify(result)}`);
            return [result];
        }
        catch (error) {
            if (retries <= 0) {
                this.logger.log(`Failed to send message to SQS after retries: ${error.message}`, 'error');
                throw error;
            }
            this.logger.log(`Error sending message to SQS, retrying (${this.maxRetries - retries + 1}/${this.maxRetries}): ${error.message}`, 'error');
            return this.sendMessageWithRetry(queueUrl, message, retries - 1);
        }
    }
    sendMessage(queueUrl, message, retries) {
        const failedMessages = [];
        const successfulMessages = [];
        const startIndex = 0;
        const messages = !Array.isArray(message) ? [message] : message;
        try {
            const batches = messages.map((message) => ({
                Id: message.id,
                MessageBody: message.body,
                MessageAttributes: message.messageAttributes,
                MessageGroupId: message.groupId,
                MessageDeduplicationId: message.deduplicationId,
                DelaySeconds: message.delaySeconds,
            }));
            return this.sendSQSBatch(queueUrl, failedMessages, successfulMessages, batches, startIndex);
        }
        catch (e) {
            if (e instanceof error_1.FailedBatchMessagesError) {
                throw e;
            }
            if (retries <= 0) {
                return this.sendMessage(queueUrl, message, retries - 1);
            }
        }
    }
    publicMessage(topicArn, message, retries) {
        const failedMessages = [];
        const successfulMessages = [];
        const startIndex = 0;
        const messages = !Array.isArray(message) ? [message] : message;
        try {
            const batches = messages.map(message => ({
                Id: message.id,
                Message: message.body,
                MessageAttributes: message.messageAttributes,
            }));
            return this.sendSNSBatch(topicArn, failedMessages, successfulMessages, batches, startIndex);
        }
        catch (e) {
            if (e instanceof error_1.FailedBatchMessagesError) {
                throw e;
            }
            if (retries <= 0) {
                return this.sendMessage(topicArn, message, retries - 1);
            }
        }
    }
}
exports.Producer = Producer;
//# sourceMappingURL=producer.js.map