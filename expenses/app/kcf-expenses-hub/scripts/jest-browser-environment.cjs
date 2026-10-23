'use strict';
// TEST ONLY. Keep SPFx's jsdom DOM/realms and supply missing browser standards
// using the installed, pinned Node implementations. No app runtime polyfill,
// authentication substitute, WebCrypto mock or production capability override.
const { TestEnvironment } = require('jest-environment-jsdom');
const { TextEncoder, TextDecoder } = require('node:util');
const { ReadableStream } = require('node:stream/web');
// Capture outside the Jest VM: jsdom's global does not provide this API.
const nativeStructuredClone = globalThis.structuredClone;
const nativeResponse = globalThis.Response;

module.exports = class KcfBrowserTestEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    const capabilities = { TextEncoder, TextDecoder, ReadableStream, Response: nativeResponse, structuredClone: nativeStructuredClone };
    for (const [name, implementation] of Object.entries(capabilities)) {
      if (typeof this.global[name] === 'undefined') {
        if (typeof implementation !== 'function') throw new Error(`Required test host API unavailable: ${name}`);
        Object.defineProperty(this.global, name, { value: implementation, configurable: true, writable: true });
      }
    }
    // Never replace Object/Array/Uint8Array/JSON/crypto: shape checks, browser
    // identity and missing-runtime-capability failures must remain observable.
  }
};
