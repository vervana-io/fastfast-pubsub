import { BaseRpcContext } from "@nestjs/microservices";
type PubSubContextArgs<P> = [any, P];
export declare class PubSubContext<P = string> extends BaseRpcContext<PubSubContextArgs<P>> {
    constructor(args: PubSubContextArgs<P>);
    getMessage(): any;
    getPattern(): P;
    ack(): Promise<void>;
    nack(): Promise<void>;
}
export {};
