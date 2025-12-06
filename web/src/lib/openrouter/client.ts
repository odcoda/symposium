import { openRouterEnv } from '@/lib/env'
import type {
  OpenRouterChatCompletionRequest,
  OpenRouterChatCompletionResponse,
  OpenRouterModelListResponse,
  OpenRouterGenerationResponse,
  OpenRouterTokens,
} from '@/types'

const API_BASE_URL = 'https://openrouter.ai/api/v1'

export interface OpenRouterClientOptions {
  getTokens: () => OpenRouterTokens | null
  onUnauthorized?: () => void
}

// const isTokenExpired = (tokens: OpenRouterTokens) => tokens.expiresAt <= Date.now()

export class OpenRouterClient {
  private readonly getTokens: () => OpenRouterTokens | null

  private readonly onUnauthorized?: () => void

  constructor(options: OpenRouterClientOptions) {
    this.getTokens = options.getTokens
    this.onUnauthorized = options.onUnauthorized
  }

  private buildHeaders(initHeaders?: HeadersInit) {
    const headers = new Headers(initHeaders ?? {})
    const tokens = this.getTokens()

    if (!tokens) {
      throw new Error('OpenRouter tokens are not available')
    }

    // if (isTokenExpired(tokens)) {
    //   this.onUnauthorized?.()
    //   throw new Error('OpenRouter access token expired')
    // }

    headers.set('Authorization', `${tokens.tokenType ?? 'Bearer'} ${tokens.accessToken}`)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json')
    }

    if (openRouterEnv.appUrl) {
      headers.set('HTTP-Referer', openRouterEnv.appUrl)
    }

    if (openRouterEnv.appTitle) {
      headers.set('X-Title', openRouterEnv.appTitle)
    }

    return headers
  }

  private async request<T>(path: string, init?: RequestInit) {
    const tokens = this.getTokens()
    if (!tokens) {
      throw new Error('OpenRouter tokens are not available')
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: this.buildHeaders(init?.headers),
    })

    if (response.status === 401) {
      this.onUnauthorized?.()
      throw new Error('OpenRouter request unauthorized')
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter request failed: ${errorText}`)
    }

    return (await response.json()) as T
  }

  listModels() {
    return this.request<OpenRouterModelListResponse>('/models')
  }

  createChatCompletion(body: OpenRouterChatCompletionRequest) {
    return this.request<OpenRouterChatCompletionResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async streamChatCompletion(body: OpenRouterChatCompletionRequest, signal?: AbortSignal) {
    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders({
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    })

    if (response.status === 401) {
      this.onUnauthorized?.()
      throw new Error('OpenRouter request unauthorized')
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter request failed: ${errorText}`)
    }

    return response
  }

  async getGeneration(id: string) {
    const params = new URLSearchParams({ id })
    const response = await this.request<OpenRouterGenerationResponse>(
      `/generation?${params.toString()}`,
    )
    return response.data
  }
}

export const createOpenRouterClient = (options: OpenRouterClientOptions) => new OpenRouterClient(options)
