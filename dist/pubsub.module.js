"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PubSubModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PubSubModule = exports.PUBSUB_OPTIONS = void 0;
const common_1 = require("@nestjs/common");
const pubsub_client_1 = require("./pubsub.client");
exports.PUBSUB_OPTIONS = 'PUBSUB_OPTIONS';
let PubSubModule = PubSubModule_1 = class PubSubModule {
    static forRoot(options) {
        return {
            module: PubSubModule_1,
            global: true,
            providers: [
                {
                    provide: exports.PUBSUB_OPTIONS,
                    useValue: options,
                },
                {
                    provide: pubsub_client_1.PubSubClient,
                    useFactory: async (options) => {
                        const client = new pubsub_client_1.PubSubClient(options);
                        await client.connect();
                        return client;
                    },
                    inject: [exports.PUBSUB_OPTIONS],
                },
            ],
            exports: [pubsub_client_1.PubSubClient],
        };
    }
    static forRootAsync(options) {
        return {
            module: PubSubModule_1,
            global: true,
            providers: [
                this.createAsyncOptionsProvider(options),
                {
                    provide: pubsub_client_1.PubSubClient,
                    useFactory: async (options) => {
                        const client = new pubsub_client_1.PubSubClient(options);
                        await client.connect();
                        return client;
                    },
                    inject: [exports.PUBSUB_OPTIONS],
                },
            ],
            exports: [pubsub_client_1.PubSubClient],
        };
    }
    static createAsyncOptionsProvider(options) {
        if (options.useFactory) {
            return {
                provide: exports.PUBSUB_OPTIONS,
                useFactory: options.useFactory,
                inject: options.inject || [],
            };
        }
        if (options.useClass) {
            return {
                provide: exports.PUBSUB_OPTIONS,
                useClass: options.useClass,
            };
        }
        if (options.useExisting) {
            return {
                provide: exports.PUBSUB_OPTIONS,
                useExisting: options.useExisting,
            };
        }
        throw new Error('Invalid async options');
    }
};
exports.PubSubModule = PubSubModule;
exports.PubSubModule = PubSubModule = PubSubModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({})
], PubSubModule);
//# sourceMappingURL=pubsub.module.js.map