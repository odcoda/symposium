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

export type OpenRouterGeneration =
  & {
    id: string
    upstream_id?: string
    total_cost?: number
    cache_discount?: number
    upstream_inference_cost?: number
    created_at?: string
    model?: string
    app_id?: number
    streamed?: boolean
    cancelled?: boolean
    provider_name?: string
    latency?: number
    moderation_latency?: number
    generation_time?: number
    finish_reason?: string
    tokens_prompt?: number
    tokens_completion?: number
    native_tokens_prompt?: number
    native_tokens_completion?: number
    native_tokens_completion_images?: number
    native_tokens_reasoning?: number
    native_tokens_cached?: number
    num_media_prompt?: number
    num_input_audio_prompt?: number
    num_media_completion?: number
    num_search_results?: number
    origin?: string
    usage?: number
    is_byok?: boolean
    native_finish_reason?: string
    external_user?: string
    api_type?: string
  }
  & Record<string, unknown>

export interface OpenRouterGenerationResponse {
  data: OpenRouterGeneration
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
