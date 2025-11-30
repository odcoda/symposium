export type OpenRouterTokenType = 'Bearer' | string

export interface OpenRouterTokens {
  accessToken: string
  refreshToken: string | null
  tokenType: OpenRouterTokenType
  scopes: string[]
  expiresAt: number
}

export interface OpenRouterTokenResponse {
  key: string
  user_id?: string
}

export interface PkceSession {
  state: string
  codeVerifier: string
  createdAt: number
}

export interface OpenRouterModel {
  id: string
  name: string
  description?: string
  pricing?: {
    prompt?: string
    completion?: string
  }
}

export interface OpenRouterModelListResponse {
  data: OpenRouterModel[]
}

export type OpenRouterChatRole = 'system' | 'user' | 'assistant'

export interface OpenRouterChatMsg {
  role: OpenRouterChatRole
  content: string
  name?: string
}

export interface OpenRouterChatCompletionRequest {
  model: string
  messages: OpenRouterChatMsg[]
  temperature?: number
  top_p?: number
  max_output_tokens?: number
  stream?: boolean
  repetition_penalty?: number
  metadata?: Record<string, unknown>
}

export interface OpenRouterChatCompletionChoice {
  index: number
  message: OpenRouterChatMsg
  finish_reason: 'stop' | 'length' | 'tool_calls' | string | null
}

export interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface OpenRouterChatCompletionResponse {
  id: string
  created: number
  model: string
  choices: OpenRouterChatCompletionChoice[]
  usage?: OpenRouterUsage
}
