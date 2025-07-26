export declare const PUBSUB_HANDLER_OPTIONS = "PUBSUB_HANDLER_OPTIONS";
export interface PubSubHandlerOptions {
    batch?: boolean;
    retry?: number;
}
export declare function PubSubMessagePattern(pattern: string, options?: PubSubHandlerOptions): (target: any, key: string, descriptor: PropertyDescriptor) => void;
