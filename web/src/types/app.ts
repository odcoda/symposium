export type AppView = 'conversations' | 'personalities'

export type Role = 'user' | 'assistant' | 'system'

export type MessageStatus = 'complete' | 'streaming' | 'error' | 'cancelled'

export interface Message {
  id: string
  conversationId: string
  authorId: string
  authorRole: Role
  content: string
  createdAt: string
  status: MessageStatus
}

export interface Personality {
  id: string
  name: string
  model: string
  description: string
  prompt: string
  temperature: number
  eagerness: number
  color: string
  createdAt: string
  updatedAt: string
}

export interface Conversation {
  id: string
  title: string
  participantIds: string[]
  messageIds: string[]
  activePersonalityIds: string[]
  createdAt: string
  updatedAt: string
}

export interface MemoryCheckpoint {
  id: string
  conversationId: string
  summary: string
  createdAt: string
  personalityId?: string
}

export type ResponsePacing = 'relaxed' | 'steady' | 'quick'

export interface SchedulerSettings {
  maxConcurrent: number
  responseDelayMs: number
  responsePacing: ResponsePacing
  autoStart: boolean
}

export type RequestStatus = 'queued' | 'in-flight' | 'completed' | 'cancelled' | 'error'

export interface RequestQueueItem {
  id: string
  conversationId: string
  authorId: string
  messageId: string
  enqueuedAt: number
  status: RequestStatus
  error?: string
}
