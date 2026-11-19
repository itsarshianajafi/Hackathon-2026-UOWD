import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export function freeModelId(value = process.env.ESTARO_MODEL) {
  const model = value?.trim() || "openrouter/free";
  if (model !== "openrouter/free" && !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*:free$/.test(model)) {
    throw new Error("ESTARO_MODEL must be openrouter/free or an OpenRouter model ID ending in :free.");
  }
  return model;
}

export function createChatModel(apiKey: string, model: string) {
  const openrouter = createOpenRouter({ apiKey, headers: { "X-Title": "Estaro" } });
  return openrouter.chat(freeModelId(model), {
    provider: {
      require_parameters: true,
      // Refuse paid endpoints, including any provider fallback.
      max_price: { prompt: 0, completion: 0, request: 0 },
    },
  });
}
