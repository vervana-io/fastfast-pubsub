import {BaseRpcContext} from "@nestjs/microservices";

type PubSubContextArgs<P> = [any, P];

export class PubSubContext<P = string> extends BaseRpcContext<PubSubContextArgs<P>> {
    constructor(args: PubSubContextArgs<P>) {
        super(args);
    }

    getMessage(): any {
        return this.args[0];
    }

    getPattern(): P {
        return this.args[1];
    }

    // Manual ack: delete the message from the queue
    async ack(): Promise<void> {
        if (typeof this.args[0].deleteMessage === 'function') {
            await this.args[0].deleteMessage();
        }
    }

    // Manual nack: optionally change visibility or just do nothing (message will be retried)
    async nack(): Promise<void> {
        // Optionally, you could call changeMessageVisibility here
        // For now, do nothing and let SQS retry after visibility timeout
    }
} 