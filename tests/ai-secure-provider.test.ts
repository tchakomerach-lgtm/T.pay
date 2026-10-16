import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIResponsesProvider, AnthropicMessagesProvider } from "../packages/ai/src/vendor-providers.js";
import { HttpJsonAiProvider } from "../packages/ai/src/http-provider.js";

test("AI vendor providers reject unapproved endpoints", () => {
  assert.throws(() => new OpenAIResponsesProvider({ apiKey: "unit-test-key", model: "m", priority: 1, endpoint: "http://api.openai.com/v1/responses" }), /AI_PROVIDER_ENDPOINT_NOT_ALLOWLISTED/);
  assert.throws(() => new OpenAIResponsesProvider({ apiKey: "unit-test-key", model: "m", priority: 1, endpoint: "https://api.openai.com.evil.example/v1/responses" }), /AI_PROVIDER_ENDPOINT_NOT_ALLOWLISTED/);
  assert.throws(() => new AnthropicMessagesProvider({ apiKey: "unit-test-key", model: "m", priority: 1, endpoint: "https://api.anthropic.com/v1/messages-evil" }), /AI_PROVIDER_ENDPOINT_NOT_ALLOWLISTED/);
});

test("generic HTTP AI provider requires an explicit endpoint allowlist", () => {
  assert.throws(() => new HttpJsonAiProvider({
    id: "compatible", endpoint: "https://provider.example/v1/generate", apiKey: "unit-test-key",
    priority: 1, requestTimeoutMs: 1000, allowedEndpoints: [],
  }), /AI_PROVIDER_ENDPOINT_NOT_ALLOWLISTED|AI_PROVIDER_ALLOWLIST_REQUIRED/);
  assert.throws(() => new HttpJsonAiProvider({
    id: "compatible", endpoint: "https://provider.example.evil/v1/generate", apiKey: "unit-test-key",
    priority: 1, requestTimeoutMs: 1000,
    allowedEndpoints: [{ origin: "https://provider.example", pathPrefix: "/v1" }],
  }), /AI_PROVIDER_ENDPOINT_NOT_ALLOWLISTED/);
});
