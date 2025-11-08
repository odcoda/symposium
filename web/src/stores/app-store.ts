import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'

import type {
  AppView,
  Conversation,
  Message,
  MessageStatus,
  Personality,
  RequestQueueItem,
  SchedulerSettings,
} from '@/types'
import type { PersonalitySchedulerState, PersonalitySchedulerStateMap } from '@/types/scheduler'
import { createId } from '@/utils/id'
import { resolveStorage } from '@/utils/storage'

const STORE_KEY = 'symposium-app-state'
const STORE_VERSION = 1

const DEFAULT_TRIGGER_MODE: SchedulerSettings['triggerMode'] = 'medium'
const DEFAULT_SELECTION_TEMPERATURE = 1
const DEFAULT_POLITENESS_DECAY = 0.8

export const createPersonalitySchedulerState = (
  messageCounter: number,
): PersonalitySchedulerState => ({
  mentionScore: 0,
  politenessScore: 0,
  lastUpdatedMessageIndex: messageCounter,
  lastSpokeMessageIndex: null,
})

export const applySchedulerMessageUpdate = (
  state: BaseState,
  message: Message,
): SchedulerState => {
  const nextMessageIndex = state.scheduler.messageCounter + 1

  const updatedPersonalityStates = Object.values(state.personalities).reduce<
    PersonalitySchedulerStateMap
  >((acc, personality) => {
    const existing =
      state.scheduler.personalityStates[personality.id] ??
      createPersonalitySchedulerState(state.scheduler.messageCounter)

    const delta = Math.max(0, nextMessageIndex - existing.lastUpdatedMessageIndex)
    const halfLife = Math.max(1, personality.politenessHalfLife)
    const decayFactor = Math.pow(0.5, delta / halfLife)
    const decayedPoliteness =
      existing.politenessScore * decayFactor * state.scheduler.settings.politenessDecayMultiplier

    acc[personality.id] = {
      ...existing,
      politenessScore: decayedPoliteness,
      lastUpdatedMessageIndex: nextMessageIndex,
    }

    return acc
  }, {})

  const lowerContent = message.content.toLowerCase()
  if (lowerContent.length > 0) {
    Object.values(state.personalities).forEach((personality) => {
      if (message.authorId === personality.id) {
        return
      }

      const personaState = updatedPersonalityStates[personality.id]
      if (!personaState) {
        return
      }

      const name = personality.name.trim().toLowerCase()
      if (!name) {
        return
      }

      if (lowerContent.includes(name)) {
        updatedPersonalityStates[personality.id] = {
          ...personaState,
          mentionScore: personaState.mentionScore + personality.mentionBoost,
        }
      }
    })
  }

  if (message.authorRole === 'assistant') {
    const personality = state.personalities[message.authorId]
    if (personality) {
      const personaState =
        updatedPersonalityStates[personality.id] ??
        createPersonalitySchedulerState(state.scheduler.messageCounter)

      updatedPersonalityStates[personality.id] = {
        ...personaState,
        mentionScore: 0,
        politenessScore: personaState.politenessScore - personality.politenessPenalty,
        lastSpokeMessageIndex: nextMessageIndex,
      }
    }
  }

  return {
    ...state.scheduler,
    personalityStates: updatedPersonalityStates,
    messageCounter: nextMessageIndex,
  }
}

interface SchedulerState {
  settings: SchedulerSettings
  queue: RequestQueueItem[]
  inFlightIds: string[]
  personalityStates: PersonalitySchedulerStateMap
  messageCounter: number
}

interface UIState {
  activeView: AppView
  isSettingsOpen: boolean
}

interface BaseState {
  personalities: Record<string, Personality>
  conversations: Record<string, Conversation>
  messages: Record<string, Message>
  activeConversationId: string | null
  scheduler: SchedulerState
  ui: UIState
}

type CreateConversationInput = {
  id?: string
  title?: string
  participantIds?: string[]
  activePersonalityIds?: string[]
}

type AppendMessageInput = {
  id?: string
  authorId: string
  authorRole: Message['authorRole']
  content: string
  personalityId?: string
  status?: MessageStatus
  createdAt?: string
}

type CreatePersonalityInput = {
  id?: string
  name?: string
  model?: string
  description?: string
  prompt?: string
  temperature?: number
  eagerness?: number
  politenessPenalty?: number
  politenessHalfLife?: number
  mentionBoost?: number
  autoRespond?: boolean
  color?: string
}

type QueueRequestInput = Omit<RequestQueueItem, 'id' | 'enqueuedAt' | 'status'> & {
  id?: string
  status?: RequestQueueItem['status']
  error?: string
}

type AppActions = {
  setActiveView: (view: AppView) => void
  openSettings: () => void
  closeSettings: () => void
  setActiveConversation: (conversationId: string) => void
  createConversation: (input?: CreateConversationInput) => string
  removeConversation: (conversationId: string) => void
  appendMessage: (conversationId: string, input: AppendMessageInput) => string | undefined
  updateMessage: (messageId: string, updates: Partial<Message>) => void
  createPersonality: (input?: CreatePersonalityInput) => string
  updatePersonality: (personalityId: string, updates: Partial<Personality>) => void
  deletePersonality: (personalityId: string) => void
  updateSchedulerSettings: (settings: Partial<SchedulerSettings>) => void
  queueRequest: (input: QueueRequestInput) => string
  updateQueueItem: (requestId: string, updates: Partial<RequestQueueItem>) => void
  removeQueueItem: (requestId: string) => void
  markRequestInFlight: (requestId: string) => void
}

export type AppState = BaseState & { actions: AppActions }

type PersistedState = Partial<
  Pick<BaseState, 'personalities' | 'conversations' | 'messages' | 'activeConversationId'>
> & {
  scheduler?: {
    settings?: SchedulerSettings
  }
  ui?: {
    activeView?: AppView
  }
}


const createInitialState = (): BaseState => {
  const timestamp = new Date().toISOString()

  const defaultPersonality: Personality = {
    id: 'personality-default',
    name: 'Generalist',
    model: 'openrouter/auto',
    description: 'A balanced collaborator focused on thoughtful, concise responses.',
    prompt: 'You are a helpful collaborator who reasons carefully and communicates succinctly.',
    temperature: 0.6,
    eagerness: 0.5,
    politenessPenalty: 0.2,
    politenessHalfLife: 4,
    mentionBoost: 1,
    color: '#6366f1',
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const defaultConversationId = 'conversation-welcome'
  const defaultMessageId = 'message-welcome'

  const defaultMessage: Message = {
    id: defaultMessageId,
    conversationId: defaultConversationId,
    authorId: defaultPersonality.id,
    authorRole: 'assistant',
    content: 'Welcome to Symposium! Start a conversation or customise personalities to get going.',
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'complete',
  }

  const defaultConversation: Conversation = {
    id: defaultConversationId,
    title: 'Welcome Chat',
    participantIds: ['user', defaultPersonality.id],
    messageIds: [defaultMessageId],
    activePersonalityIds: [defaultPersonality.id],
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return {
    personalities: {
      [defaultPersonality.id]: defaultPersonality,
    },
    conversations: {
      [defaultConversation.id]: defaultConversation,
    },
    messages: {
      [defaultMessage.id]: defaultMessage,
    },
    activeConversationId: defaultConversation.id,
    scheduler: {
      settings: {
        maxConcurrent: 2,
        responseDelayMs: 1200,
        responsePacing: 'steady',
        autoStart: false,
        triggerMode: DEFAULT_TRIGGER_MODE,
        selectionTemperature: DEFAULT_SELECTION_TEMPERATURE,
        politenessDecayMultiplier: DEFAULT_POLITENESS_DECAY,
      },
      queue: [],
      inFlightIds: [],
      personalityStates: {
        [defaultPersonality.id]: createPersonalitySchedulerState(0),
      },
      messageCounter: 0,
    },
    ui: {
      activeView: 'conversations',
      isSettingsOpen: false,
    },
  }
}

const storage = createJSONStorage<PersistedState>(() => resolveStorage())

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => {
        const actions: AppActions = {
          setActiveView: (view) =>
            set(
              (state) => ({
                ui: {
                  ...state.ui,
                  activeView: view,
                },
              }),
              false,
              'ui/setActiveView',
            ),
          openSettings: () =>
            set(
              (state) => ({
                ui: {
                  ...state.ui,
                  isSettingsOpen: true,
                },
              }),
              false,
              'ui/openSettings',
            ),
          closeSettings: () =>
            set(
              (state) => ({
                ui: {
                  ...state.ui,
                  isSettingsOpen: false,
                },
              }),
              false,
              'ui/closeSettings',
            ),
          setActiveConversation: (conversationId) =>
            set(
              (state) => {
                if (!state.conversations[conversationId]) {
                  return {}
                }

                return {
                  activeConversationId: conversationId,
                  ui: {
                    ...state.ui,
                    activeView: 'conversations',
                  },
                }
              },
              false,
              'conversations/setActive',
            ),
          createConversation: (input) => {
            const id = input?.id ?? createId()
            const title = input?.title?.trim() || 'New Conversation'
            const now = new Date().toISOString()

            const conversation: Conversation = {
              id,
              title,
              participantIds: input?.participantIds ?? [],
              messageIds: [],
              activePersonalityIds: input?.activePersonalityIds ?? [],
              createdAt: now,
              updatedAt: now,
            }

            set(
              (state) => ({
                conversations: {
                  ...state.conversations,
                  [conversation.id]: conversation,
                },
                activeConversationId: conversation.id,
                ui: {
                  ...state.ui,
                  activeView: 'conversations',
                },
              }),
              false,
              'conversations/create',
            )

            return conversation.id
          },
          removeConversation: (conversationId) =>
            set(
              (state) => {
                if (!state.conversations[conversationId]) {
                  return {}
                }

                const rest = { ...state.conversations }
                delete rest[conversationId]
                const remainingMessages = { ...state.messages }

                Object.entries(remainingMessages).forEach(([messageId, message]) => {
                  if (message.conversationId === conversationId) {
                    delete remainingMessages[messageId]
                  }
                })

                const nextConversationId =
                  state.activeConversationId === conversationId
                    ? Object.keys(rest)[0] ?? null
                    : state.activeConversationId

                return {
                  conversations: rest,
                  messages: remainingMessages,
                  activeConversationId: nextConversationId,
                }
              },
              false,
              'conversations/remove',
            ),
          appendMessage: (conversationId, input) => {
            const conversation = get().conversations[conversationId]
            if (!conversation) {
              return undefined
            }

            const id = input.id ?? createId()
            const createdAt = input.createdAt ?? new Date().toISOString()
            const status: MessageStatus = input.status ?? 'complete'

            const message: Message = {
              id,
              conversationId,
              authorId: input.authorId,
              authorRole: input.authorRole,
              content: input.content,
              createdAt,
              updatedAt: createdAt,
              status,
            }

            set(
              (state) => ({
                messages: {
                  ...state.messages,
                  [id]: message,
                },
                conversations: {
                  ...state.conversations,
                  [conversationId]: {
                    ...state.conversations[conversationId],
                    messageIds: [...state.conversations[conversationId].messageIds, id],
                    updatedAt: createdAt,
                  },
                },
                scheduler: applySchedulerMessageUpdate(state, message),
              }),
              false,
              'messages/append',
            )

            return id
          },
          updateMessage: (messageId, updates) =>
            set(
              (state) => {
                const existing = state.messages[messageId]
                if (!existing) {
                  return {}
                }

                return {
                  messages: {
                    ...state.messages,
                    [messageId]: {
                      ...existing,
                      ...updates,
                      id: existing.id,
                    },
                  },
                }
              },
              false,
              'messages/update',
            ),
          createPersonality: (input) => {
            const id = input?.id ?? createId()
            const now = new Date().toISOString()

            const personality: Personality = {
              id,
              name: input?.name?.trim() || 'New Personality',
              model: input?.model ?? 'openrouter/auto',
              description: input?.description ?? '',
              prompt:
                input?.prompt ?? 'You are a helpful collaborator who reasons carefully and communicates succinctly.',
              temperature: input?.temperature ?? 0.7,
              eagerness: input?.eagerness ?? 0.5,
              politenessPenalty: input?.politenessPenalty ?? 0.2,
              politenessHalfLife: input?.politenessHalfLife ?? 4,
              mentionBoost: input?.mentionBoost ?? 1,
              color: input?.color ?? '#14b8a6',
              createdAt: now,
              updatedAt: now,
            }

            set(
              (state) => ({
                personalities: {
                  ...state.personalities,
                  [personality.id]: personality,
                },
                scheduler: {
                  ...state.scheduler,
                  personalityStates: {
                    ...state.scheduler.personalityStates,
                    [personality.id]: createPersonalitySchedulerState(state.scheduler.messageCounter),
                  },
                },
              }),
              false,
              'personalities/create',
            )

            return personality.id
          },
          updatePersonality: (personalityId, updates) =>
            set(
              (state) => {
                const existing = state.personalities[personalityId]
                if (!existing) {
                  return {}
                }

                return {
                  personalities: {
                    ...state.personalities,
                    [personalityId]: {
                      ...existing,
                      ...updates,
                      id: existing.id,
                      updatedAt: new Date().toISOString(),
                    },
                  },
                }
              },
              false,
              'personalities/update',
            ),
          deletePersonality: (personalityId) =>
            set(
              (state) => {
                if (!state.personalities[personalityId]) {
                  return {}
                }

                const rest = { ...state.personalities }
                delete rest[personalityId]

                const updatedConversations = Object.fromEntries(
                  Object.entries(state.conversations).map(([id, conversation]) => [
                    id,
                    {
                      ...conversation,
                      participantIds: conversation.participantIds.filter(
                        (participantId) => participantId !== personalityId,
                      ),
                      activePersonalityIds: conversation.activePersonalityIds.filter(
                        (participantId) => participantId !== personalityId,
                      ),
                    },
                  ]),
                )

                const remainingSchedulerStates = { ...state.scheduler.personalityStates }
                delete remainingSchedulerStates[personalityId]

                return {
                  personalities: rest,
                  conversations: updatedConversations,
                  scheduler: {
                    ...state.scheduler,
                    personalityStates: remainingSchedulerStates,
                  },
                }
              },
              false,
              'personalities/delete',
            ),
          updateSchedulerSettings: (settings) =>
            set(
              (state) => ({
                scheduler: {
                  ...state.scheduler,
                  settings: {
                    ...state.scheduler.settings,
                    ...settings,
                  },
                },
              }),
              false,
              'scheduler/updateSettings',
            ),
          queueRequest: (input) => {
            const id = input.id ?? createId()
            const enqueuedAt = Date.now()
            const status = input.status ?? 'queued'

            set(
              (state) => ({
                scheduler: {
                  ...state.scheduler,
                  queue: [
                    ...state.scheduler.queue,
                    {
                      id,
                      conversationId: input.conversationId,
                      authorId: input.authorId,
                      messageId: input.messageId,
                      enqueuedAt,
                      status,
                      error: input.error,
                    },
                  ],
                },
              }),
              false,
              'scheduler/queueRequest',
            )

            return id
          },
          updateQueueItem: (requestId, updates) =>
            set(
              (state) => ({
                scheduler: {
                  ...state.scheduler,
                  queue: state.scheduler.queue.map((item) =>
                    item.id === requestId
                      ? {
                          ...item,
                          ...updates,
                          id: item.id,
                        }
                      : item,
                  ),
                },
              }),
              false,
              'scheduler/updateQueueItem',
            ),
          removeQueueItem: (requestId) =>
            set(
              (state) => ({
                scheduler: {
                  ...state.scheduler,
                  queue: state.scheduler.queue.filter((item) => item.id !== requestId),
                  inFlightIds: state.scheduler.inFlightIds.filter((id) => id !== requestId),
                },
              }),
              false,
              'scheduler/removeQueueItem',
            ),
          markRequestInFlight: (requestId) =>
            set(
              (state) => ({
                scheduler: {
                  ...state.scheduler,
                  inFlightIds: state.scheduler.inFlightIds.includes(requestId)
                    ? state.scheduler.inFlightIds
                    : [...state.scheduler.inFlightIds, requestId],
                },
              }),
              false,
              'scheduler/markRequestInFlight',
            ),
        }

        return {
          ...createInitialState(),
          actions,
        }
      },
      {
        name: STORE_KEY,
        version: STORE_VERSION,
        storage,
        merge: (persistedState, currentState) => {
          if (!persistedState) {
            return currentState
          }

          const typed = persistedState as PersistedState
          const { scheduler, ui, ...rest } = typed

          const mergedPersonalities = {
            ...currentState.personalities,
            ...(rest.personalities ?? {}),
          }

          const mergedPersonalityStates = Object.keys(mergedPersonalities).reduce<
            PersonalitySchedulerStateMap
          >((acc, personalityId) => {
            const existing = currentState.scheduler.personalityStates[personalityId]
            acc[personalityId] =
              existing ?? createPersonalitySchedulerState(currentState.scheduler.messageCounter)
            return acc
          }, {})

          return {
            ...currentState,
            ...rest,
            personalities: mergedPersonalities,
            scheduler: {
              ...currentState.scheduler,
              settings: {
                ...currentState.scheduler.settings,
                ...(scheduler?.settings ?? {}),
              },
              personalityStates: mergedPersonalityStates,
            },
            ui: {
              ...currentState.ui,
              activeView: ui?.activeView ?? currentState.ui.activeView,
            },
          }
        },
        partialize: (state): PersistedState => ({
          personalities: state.personalities,
          conversations: state.conversations,
          messages: state.messages,
          activeConversationId: state.activeConversationId,
          scheduler: {
            settings: state.scheduler.settings,
          },
          ui: {
            activeView: state.ui.activeView,
          },
        }),
        migrate: (persistedState) => {
          const base = createInitialState()
          if (!persistedState) {
            return base
          }

          const typed = persistedState as PersistedState

          const mergedPersonalities = {
            ...base.personalities,
            ...(typed.personalities ?? {}),
          }

          const mergedPersonalityStates = Object.keys(mergedPersonalities).reduce<
            PersonalitySchedulerStateMap
          >((acc, personalityId) => {
            acc[personalityId] =
              base.scheduler.personalityStates[personalityId] ??
              createPersonalitySchedulerState(base.scheduler.messageCounter)
            return acc
          }, {})

          return {
            personalities: mergedPersonalities,
            conversations: {
              ...base.conversations,
              ...(typed.conversations ?? {}),
            },
            messages: {
              ...base.messages,
              ...(typed.messages ?? {}),
            },
            activeConversationId: typed.activeConversationId ?? base.activeConversationId,
            scheduler: {
              ...base.scheduler,
              settings: {
                ...base.scheduler.settings,
                ...(typed.scheduler?.settings ?? {}),
              },
              queue: [],
              inFlightIds: [],
              personalityStates: mergedPersonalityStates,
              messageCounter: base.scheduler.messageCounter,
            },
            ui: {
              activeView: typed.ui?.activeView ?? base.ui.activeView,
              isSettingsOpen: false,
            },
          }
        },
      },
    ),
    {
      name: 'app-store',
    },
  ),
)
