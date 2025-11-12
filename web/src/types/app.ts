export type AppView = 'arcs' | 'nyms'

/*
  The role of a message author, in llm terminology.
  All nyms use the 'assistant' role.
  Tool calls aren't supported yet.
*/
export type Role = 'user' | 'assistant' | 'system'

/*
  The status of a message. The ArcScheduler keeps this up to date
  based on the raw completion responses from the model provider.
*/
export type MsgStatus = 'complete' | 'streaming' | 'error' | 'cancelled'

/*
  A single message in an arc.

  Every attempted completion request gets a response Msg object, even if it
  never got a response or errored/canceled.

  Currently, we display all messages to the user in the chat window. Eventually
  with tool calling and artifacts we will want a more sophisticated approach
  where only chat messages get rendered.

  TODO support separate chat vs document msgs

  id - Unique identifier for the msg.
  arcId - The ID of the arc this msg belongs to.
  authorId - The ID of the author who wrote this msg. Either 'user', 'system', or a nym id.
  authorRole - The author's role.
  content - Raw text
  createdAt - Timestamp
  updatedAt - Timestamp
  status - Displayed to the user
  statusDetails - Displayed to the user (e.g. error msgs)
  chunks - raw completion responses from model provider (for debugging)
  generation - raw generation info (e.g. cost, token counts) from model provider (for debugging)
  debug - additional info for debugging
*/
export interface Msg {
  id: string
  arcId: string
  authorId: string
  authorRole: Role
  content: string
  createdAt: string
  updatedAt: string
  status: MsgStatus
  statusDetails?: string
  chunks?: Record<string, unknown>[]
  generation?: Record<string, unknown>
  debug?: string
}

/*
  A "nym" (pseudonym, I guess) is basically an LLM that we can talk to.

  Stores all the information we need to make an LLM call.

  Currently only openrouter is supported.

  TODO add other providers

  There are many configurable openrouter parameters and I wasn't sure which to use.
  For now only temperature is exposed.

  TODO add more configurable parameters

  id - Unique identifier for the nym. This is used as the authorId in msgs.
  name - Display name for the nym
  description - Display description
  color - Hex color for msgs
  model - Full LLM version string for openrouter
  prompt - included in prompt for every model invocation (note: not the full prompt)
  temperature - for model invocation
  eagerness - for scheduling (base eagerness in the backoff algorithm)
  politenessPenalty - penalty applied when the nym speaks
  politenessHalfLife - number of msgs before politeness penalty halves
  mentionBoost - increment applied when the nym is mentioned
  createdAt - Timestamp
  updatedAt - Timestamp
  debug - additional info for debugging
*/
export interface Nym {
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
  A chat arc.

  For now this is basically a conversation, but eventually we'll add more structure.

  We track all participants who have ever been in the arc, as well as
  the active nyms (for rendering in the UI).
  */
export interface Arc {
  id: string
  title: string
  participantIds: string[]
  msgIds: string[]
  activeNymIds: string[]
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
  arcId: string
  authorId: string
  msgId: string
  enqueuedAt: number
  status: RequestStatus
  error?: string
  debug?: string
}

export type CreateArcInput = {
  title: string
  participantIds: string[]
  activeNymIds: string[]
}

export type CreateMsgInput = {
  arcId: string
  authorId: string
  authorRole: Role
  content: string
  status: MsgStatus
}

export type UpdateMsgInput = {
  content: string
  status: MsgStatus
}

export type CreateNymInput = {
  name: string
  model: string
  description: string
  prompt: string
  temperature: number
  eagerness: number
  politenessPenalty: number
  politenessHalfLife: number
  mentionBoost: number
  autoRespond: boolean
  color: string
}

export type QueueRequestInput = Omit<RequestQueueItem, 'id' | 'enqueuedAt' | 'status'> & {
  id?: string
  status?: RequestQueueItem['status']
  error?: string
}