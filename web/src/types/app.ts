export type AppView = 'conversations' | 'personalities'

/*
  The role of a message author, in llm terminology.
  All personalities use the 'assistant' role.
  Tool calls aren't supported yet.
*/
export type Role = 'user' | 'assistant' | 'system'

/*
  The status of a message. The ConversationScheduler keeps this up to date
  based on the raw completion responses from the model provider.
*/
export type MessageStatus = 'complete' | 'streaming' | 'error' | 'cancelled'

/*
  A single message in a conversation.

  Every attempted completion request gets a response Message object, even if it
  never got a response or errored/canceled.

  Currently, we display all messages to the user in the chat window. Eventually
  with tool calling and artifacts we will want a more sophisticated approach
  where only chat messages get rendered.

  TODO support separate chat vs document messages

  id - Unique identifier for the message.
  conversationId - The ID of the conversation this message belongs to.
  authorId - The ID of the author who wrote this message. Either 'user', 'system', or a personality id.
  authorRole - The author's role.
  content - Raw text
  createdAt - Timestamp
  updatedAt - Timestamp
  status - Displayed to the user
  statusDetails - Displayed to the user (e.g. error messages)
  chunks - raw completion responses from model provider (for debugging)
  generation - raw generation info (e.g. cost, token counts) from model provider (for debugging)
  debug - additional info for debugging
*/
export interface Message {
  id: string
  conversationId: string
  authorId: string
  authorRole: Role
  content: string
  createdAt: string
  updatedAt: string
  status: MessageStatus
  statusDetails?: string
  chunks?: Record<string, unknown>[]
  generation?: Record<string, unknown>
  debug?: string
}

/*
  Info about an LLM that we can talk to.

  Stores all the information we need to make an LLM call.

  Currently only openrouter is supported.

  TODO add other providers

  There are many configurable openrouter parameters and I wasn't sure which to use.
  For now only temperature is exposed.

  TODO add more configurable parameters

  id - Unique identifier for the personality. This is used as the authorId in messages.
  name - Display name for the personality
  description - Display description
  color - Hex color for messages
  model - Full LLM version string for openrouter
  prompt - included in prompt for every model invocation (note: not the full prompt)
  temperature - for model invocation
  eagerness - for scheduling (base eagerness in the backoff algorithm)
  politenessPenalty - penalty applied when the personality speaks
  politenessHalfLife - number of messages before politeness penalty halves
  mentionBoost - increment applied when the personality is mentioned
  createdAt - Timestamp
  updatedAt - Timestamp
  debug - additional info for debugging
*/
export interface Personality {
  id: string
  name: string
  description: string
  color: string
  model: string
  prompt: string
  temperature: number
  eagerness: number
  politenessPenalty: number
  politenessHalfLife: number
  mentionBoost: number
  createdAt: string
  updatedAt: string
  debug?: string
}

/*
  A chat conversation.

  We track all participants who have ever been in the conversation, as well as
  the active personalities (for rendering in the UI).
  */
export interface Conversation {
  id: string
  title: string
  participantIds: string[]
  messageIds: string[]
  activePersonalityIds: string[]
  createdAt: string
  updatedAt: string
  debug?: string
}

export type ResponsePacing = 'relaxed' | 'steady' | 'quick'

export interface SchedulerSettings {
  maxConcurrent: number
  responseDelayMs: number
  responsePacing: ResponsePacing
  autoStart: boolean
  triggerMode: 'quiet' | 'medium' | 'active'
  selectionTemperature: number
  politenessDecayMultiplier: number
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
  debug?: string
}
