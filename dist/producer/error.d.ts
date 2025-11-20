export declare class FailedBatchMessagesError extends Error {
    failedMessages: string[];
    constructor(failedMessages: string[]);
}
