"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FailedBatchMessagesError = void 0;
class FailedBatchMessagesError extends Error {
    constructor(failedMessages) {
        super(`Failed to send messages: ${failedMessages.join(", ")}`);
        this.failedMessages = failedMessages;
    }
}
exports.FailedBatchMessagesError = FailedBatchMessagesError;
//# sourceMappingURL=error.js.map