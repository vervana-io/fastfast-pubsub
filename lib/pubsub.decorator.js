"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBSUB_HANDLER_OPTIONS = void 0;
exports.PubSubMessagePattern = PubSubMessagePattern;
const common_1 = require("@nestjs/common");
exports.PUBSUB_HANDLER_OPTIONS = 'PUBSUB_HANDLER_OPTIONS';
function PubSubMessagePattern(pattern, options = {}) {
    return (target, key, descriptor) => {
        (0, common_1.SetMetadata)('pattern', pattern)(target, key, descriptor);
        (0, common_1.SetMetadata)(exports.PUBSUB_HANDLER_OPTIONS, options)(target, key, descriptor);
    };
}
//# sourceMappingURL=pubsub.decorator.js.map