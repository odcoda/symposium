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

export const executeChatCompletion = async ({
  client,
  request,
  signal,
  onContentChunk,
}: ExecuteChatCompletionParams): Promise<ExecuteChatCompletionResult> => {
  if (!client) {
    await sleep(800)
    const fallback = `(${request.model}) Stubbed response for development.`
    onContentChunk?.(fallback)
    return {
      response: null,
      content: fallback,
    }
  }

  if (signal?.aborted) {
    throw new Error('Request aborted')
  }

  const response = await client.createChatCompletion(request)
  const message = response.choices[0]?.message?.content ?? ''
  if (message) {
    onContentChunk?.(message)
  }

  return {
    response,
    content: message,
  }
}
