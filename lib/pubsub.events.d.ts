type VoidCallback = () => void;
type OnErrorCallback = (error: any) => void;
type OnMessageCallback = (message: any) => void;
type OnBatchCallback = (messages: any[]) => void;
export type PubSubEvents = {
    message_received: OnMessageCallback;
    message_processed: OnMessageCallback;
    batch_processed: OnBatchCallback;
    processing_error: VoidCallback;
    error: OnErrorCallback;
};
export {};
