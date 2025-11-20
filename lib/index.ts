/**
 * NestJS AWS Pub/Sub - Microservice transport for AWS SQS and SNS
 * 
 * This library provides a custom transport strategy for NestJS microservices
 * using AWS SQS and SNS, with support for pub/sub patterns, message acknowledgment,
 * batch processing, retry logic, and SNS fan-out.
 */

export * from './pubsub.context'
export * from './pubsub.events'
export * from './pubsub.server'
export * from './pubsub.interface'
export * from './pubsub.client'
export * from './pubsub.decorator'

// Explicitly export PubSubModule and PUBSUB_OPTIONS to ensure TypeScript compatibility
export { PubSubModule, PUBSUB_OPTIONS } from './pubsub.module'
