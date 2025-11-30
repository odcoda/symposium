import { getFeatureFlag } from '@/lib/devtools/feature-flags'
import type {
  OpenRouterChatCompletionRequest,
  OpenRouterChatCompletionResponse,
} from '@/types'

import type { OpenRouterClient } from './client'

export interface CompletionCallbacks {
  onContentChunk?: (chunk: string) => void
  onReasoningChunk?: (chunk: string) => void
}

export interface ExecuteChatCompletionParams extends CompletionCallbacks {
  client: OpenRouterClient | null
  request: OpenRouterChatCompletionRequest
  signal?: AbortSignal
}

export interface ExecuteChatCompletionResult {
  response: OpenRouterChatCompletionResponse | null
  content: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const extractDeltaContent = (delta: unknown): string => {
  if (!delta) {
    return ''
  }

  if (typeof delta === 'string') {
    return delta
  }

  if (Array.isArray(delta)) {
    return delta.map((part) => extractDeltaContent(part)).join('')
  }

  if (typeof delta === 'object') {
    const record = delta as Record<string, unknown>
    if (typeof record.content === 'string') {
      return record.content
    }
    if (Array.isArray(record.content)) {
      return record.content.map((part) => extractDeltaContent(part)).join('')
    }
    if (typeof record.text === 'string') {
      return record.text
    }
  }

  return ''
}

export const executeChatCompletion = async ({
  client,
  request,
  signal,
  onContentChunk,
}: ExecuteChatCompletionParams): Promise<ExecuteChatCompletionResult> => {
  const manualStub = getFeatureFlag('stubLLM')

  if (!client || manualStub) {
    if (!client && !manualStub) {
      console.log('No OpenRouter client available – falling back to stubbed responses')
    }
    if (manualStub) {
      console.log('Manual LLM stub toggle is active – skipping real OpenRouter call')
    }
    // TODO: raise an obvious error here
    await sleep(800)
    const fallbackSuffix = manualStub ? 'manual stub mode' : 'missing OpenRouter client'
    const fallback = `(${request.model}) Stubbed response (${fallbackSuffix}).`
    onContentChunk?.(fallback)
    return {
      response: null,
      content: fallback,
    }
  }

  if (signal?.aborted) {
    throw new Error('Request aborted')
  }

  const streamResponse = await client.streamChatCompletion({ ...request, stream: true }, signal)
  const body = streamResponse.body
  if (!body) {
    throw new Error('Streaming not supported by response body')
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let combinedContent = ''
  let finalResponse: OpenRouterChatCompletionResponse | null = null
  let receivedDone = false

  const processBuffer = () => {
    let eventBoundary = buffer.indexOf('\n\n')
    while (eventBoundary !== -1) {
      const rawEvent = buffer.slice(0, eventBoundary)
      buffer = buffer.slice(eventBoundary + 2)

      rawEvent
        .split('\n')
        .map((line) => line.trim())
        .forEach((line) => {
          if (!line.startsWith('data:')) {
            return
          }
          const payload = line.replace(/^data:\s*/, '')
          if (!payload || payload === '[DONE]') {
            if (payload === '[DONE]') {
              receivedDone = true
            }
            return
          }

          try {
            const parsed = JSON.parse(payload) as OpenRouterChatCompletionResponse & {
              choices?: Array<{ delta?: unknown; message?: unknown }>
            }
            finalResponse = (parsed as OpenRouterChatCompletionResponse) ?? finalResponse
            const choice = parsed.choices?.[0]
            const delta = choice?.delta ?? choice?.message
            const chunk = extractDeltaContent(delta)
            if (chunk) {
              combinedContent += chunk
              onContentChunk?.(chunk)
            }
          } catch (error) {
            console.error('Failed to parse OpenRouter stream payload', error)
          }
        })

      eventBoundary = buffer.indexOf('\n\n')
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: true })
      processBuffer()
    }

    if (done) {
      buffer += decoder.decode()
      processBuffer()
      break
    }

    if (receivedDone) {
      break
    }
  }

  return {
    response: finalResponse,
    content: combinedContent,
  }
}
