import assert from 'node:assert/strict'
import test from 'node:test'
import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { createChatModel, freeModelId } from '../src/lib/openrouter.ts'

test('free model selection rejects paid models and routing overrides', () => {
  assert.equal(freeModelId(''), 'openrouter/free')
  assert.equal(freeModelId('  openrouter/free  '), 'openrouter/free')
  assert.equal(freeModelId('qwen/qwen3-4b:free'), 'qwen/qwen3-4b:free')
  for (const model of ['gpt-4.1-mini', 'openai/gpt-4.1-mini', 'openrouter/auto', 'qwen/qwen3:free:online', '@preset/free', 'qwen/qwen3:free?model=paid']) {
    assert.throws(() => freeModelId(model), /must be openrouter\/free/)
    assert.throws(() => createChatModel('test-key', model), /must be openrouter\/free/)
  }
})

test('OpenRouter tool loop preserves results and enforces zero pricing on every call', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-key')
    const body = JSON.parse(options.body)
    requests.push(body)
    assert.equal(body.model, 'openrouter/free')
    assert.deepEqual(body.provider, {
      require_parameters: true,
      max_price: { prompt: 0, completion: 0, request: 0 },
    })
    assert.equal(body.tools[0].function.name, 'get_area_outlook')
    const first = requests.length === 1
    return Response.json({
      id: `test-${requests.length}`, object: 'chat.completion', created: 1, model: 'test/model:free',
      choices: [{ index: 0, finish_reason: first ? 'tool_calls' : 'stop', message: first
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'get_area_outlook', arguments: '{"area":"Dubai Marina"}' } }] }
        : { role: 'assistant', content: 'The area forecast is 100 sales.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    })
  })
  const result = await generateText({
    model: createChatModel('test-key', 'openrouter/free'),
    prompt: 'Check the Dubai Marina forecast.',
    tools: { get_area_outlook: tool({
      description: 'Get an area forecast.', inputSchema: z.object({ area: z.string() }),
      execute: async ({ area }) => ({ area, forecast_sales: 100 }),
    }) },
    stopWhen: stepCountIs(2),
  })
  assert.equal(requests.length, 2)
  const toolMessage = requests[1].messages.find((message) => message.role === 'tool')
  assert.equal(toolMessage.tool_call_id, 'call-1')
  assert.deepEqual(JSON.parse(toolMessage.content), { area: 'Dubai Marina', forecast_sales: 100 })
  assert.equal(result.text, 'The area forecast is 100 sales.')
  assert.deepEqual(result.steps[0].toolResults[0].output, { area: 'Dubai Marina', forecast_sales: 100 })
})
