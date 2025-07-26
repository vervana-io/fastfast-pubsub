"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PubSubContext = void 0;
const microservices_1 = require("@nestjs/microservices");
class PubSubContext extends microservices_1.BaseRpcContext {
    constructor(args) {
        super(args);
    }
    getMessage() {
        return this.args[0];
    }
    getPattern() {
        return this.args[1];
    }
    async ack() {
        if (typeof this.args[0].deleteMessage === 'function') {
            await this.args[0].deleteMessage();
        }
    }
    async nack() {
    }
}
exports.PubSubContext = PubSubContext;
//# sourceMappingURL=pubsub.context.js.map