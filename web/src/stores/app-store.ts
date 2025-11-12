import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'

import type {
  AppView,
  Arc,
  CreateArcInput,
  CreateMsgInput,
  CreateNymInput,
  Msg,
  MsgStatus,
  Nym,
  QueueRequestInput,
  RequestQueueItem,
  SchedulerSettings,
  UpdateMsgInput,
} from '@/types'
import type { NymSchedulerState, NymSchedulerStateMap } from '@/types/scheduler'
import { createId } from '@/utils/id'
import { resolveStorage } from '@/utils/storage'

const STORE_KEY = 'symposium-app-state'
const STORE_VERSION = 2

const DEFAULT_TRIGGER_MODE: SchedulerSettings['triggerMode'] = 'medium'
const DEFAULT_SELECTION_TEMPERATURE = 1
const DEFAULT_POLITENESS_DECAY = 0.8

export const createNymSchedulerState = (
  msgCounter: number,
): NymSchedulerState => ({
  mentionScore: 0,
  politenessScore: 0,
  lastUpdatedMsgIndex: msgCounter,
  lastSpokeMsgIndex: null,
})

export const applySchedulerMsgUpdate = (
  state: BaseState,
  msg: Msg,
): SchedulerState => {
  const nextMsgIndex = state.scheduler.msgCounter + 1

  const updatedNymStates = Object.values(state.nyms).reduce<
    NymSchedulerStateMap
  >((acc, nym) => {
    const existing =
      state.scheduler.nymStates[nym.id] ??
      createNymSchedulerState(state.scheduler.msgCounter)

    const delta = Math.max(0, nextMsgIndex - existing.lastUpdatedMsgIndex)
    const halfLife = Math.max(1, nym.politenessHalfLife)
    const decayFactor = Math.pow(0.5, delta / halfLife)
    const decayedPoliteness =
      existing.politenessScore * decayFactor * state.scheduler.settings.politenessDecayMultiplier

    acc[nym.id] = {
      ...existing,
      politenessScore: decayedPoliteness,
      lastUpdatedMsgIndex: nextMsgIndex,
    }

    return acc
  }, {})

  const lowerContent = msg.content.toLowerCase()
  if (lowerContent.length > 0) {
    Object.values(state.nyms).forEach((nym) => {
      if (msg.authorId === nym.id) {
        return
      }

      const personaState = updatedNymStates[nym.id]
      if (!personaState) {
        return
      }

      const name = nym.name.trim().toLowerCase()
      if (!name) {
        return
      }

      if (lowerContent.includes(name)) {
        updatedNymStates[nym.id] = {
          ...personaState,
          mentionScore: personaState.mentionScore + nym.mentionBoost,
        }
      }
    })
  }

  if (msg.authorRole === 'assistant') {
    const nym = state.nyms[msg.authorId]
    if (nym) {
      const personaState =
        updatedNymStates[nym.id] ??
        createNymSchedulerState(state.scheduler.msgCounter)

      updatedNymStates[nym.id] = {
        ...personaState,
        mentionScore: 0,
        politenessScore: personaState.politenessScore - nym.politenessPenalty,
        lastSpokeMsgIndex: nextMsgIndex,
      }
    }
  }

  return {
    ...state.scheduler,
    nymStates: updatedNymStates,
    msgCounter: nextMsgIndex,
  }
}

interface SchedulerState {
  settings: SchedulerSettings
  queue: RequestQueueItem[]
  inFlightIds: string[]
  nymStates: NymSchedulerStateMap
  msgCounter: number
}

interface UIState {
  activeView: AppView
  isSettingsOpen: boolean
}

interface BaseState {
  nyms: Record<string, Nym>
  arcs: Record<string, Arc>
  msgs: Record<string, Msg>
  activeArcId: string | null
  scheduler: SchedulerState
  ui: UIState
}


type AppActions = {
  setActiveView: (view: AppView) => void
  openSettings: () => void
  closeSettings: () => void
  setActiveArc: (arcId: string) => void
  createArc: (input: CreateArcInput) => string
  removeArc: (arcId: string) => void
  createMsg: (arcId: string, input: CreateMsgInput) => string | undefined
  updateMsg: (msgId: string, input: UpdateMsgInput) => void
  createNym: (input?: CreateNymInput) => string
  updateNym: (nymId: string, updates: Partial<Nym>) => void
  deleteNym: (nymId: string) => void
  updateSchedulerSettings: (settings: Partial<SchedulerSettings>) => void
  queueRequest: (input: QueueRequestInput) => string
  updateQueueItem: (requestId: string, updates: Partial<RequestQueueItem>) => void
  removeQueueItem: (requestId: string) => void
  markRequestInFlight: (requestId: string) => void
}

export type AppState = BaseState & { actions: AppActions }

type PersistedState = Partial<
  Pick<BaseState, 'nyms' | 'arcs' | 'msgs' | 'activeArcId'>
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

  const defaultNym: Nym = {
    id: 'nym-default',
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

  const defaultArcId = 'arc-welcome'
  const defaultMsgId = 'msg-welcome'

  const defaultMsg: Msg = {
    id: defaultMsgId,
    arcId: defaultArcId,
    authorId: defaultNym.id,
    authorRole: 'assistant',
    content: 'Welcome to Symposium! Start an arc or customise nyms to get going.',
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'complete',
  }

  const defaultArc: Arc = {
    id: defaultArcId,
    title: 'Welcome Chat',
    participantIds: ['user', defaultNym.id],
    msgIds: [defaultMsgId],
    activeNymIds: [defaultNym.id],
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return {
    nyms: {
      [defaultNym.id]: defaultNym,
    },
    arcs: {
      [defaultArc.id]: defaultArc,
    },
    msgs: {
      [defaultMsg.id]: defaultMsg,
    },
    activeArcId: defaultArc.id,
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
      nymStates: {
        [defaultNym.id]: createNymSchedulerState(0),
      },
      msgCounter: 0,
    },
    ui: {
      activeView: 'arcs',
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
          setActiveArc: (arcId) =>
            set(
              (state) => {
                if (!state.arcs[arcId]) {
                  return {}
                }

                return {
                  activeArcId: arcId,
                  ui: {
                    ...state.ui,
                    activeView: 'arcs',
                  },
                }
              },
              false,
              'arcs/setActive',
            ),
        createArc: (input) => {
            const id = input?.id ?? createId()
            const title = input?.title?.trim() || 'New Arc'
            const now = new Date().toISOString()

            const arc: Arc = {
              id,
              title,
              participantIds: input?.participantIds ?? [],
              msgIds: [],
              createdAt: now,
              updatedAt: now,
            }

            set(
              (state) => ({
                arcs: {
                  ...state.arcs,
                  [arc.id]: arc,
                },
                activeArcId: arc.id,
                ui: {
                  ...state.ui,
                  activeView: 'arcs',
                },
              }),
              false,
              'arcs/create',
            )

            return arc.id
          },
          removeArc: (arcId) =>
            set(
              (state) => {
                if (!state.arcs[arcId]) {
                  return {}
                }

                const rest = { ...state.arcs }
                delete rest[arcId]
                const remainingMsgs = { ...state.msgs }

                Object.entries(remainingMsgs).forEach(([msgId, msg]) => {
                  if (msg.arcId === arcId) {
                    delete remainingMsgs[msgId]
                  }
                })

                const nextArcId =
                  state.activeArcId === arcId
                    ? Object.keys(rest)[0] ?? null
                    : state.activeArcId

                return {
                  arcs: rest,
                  msgs: remainingMsgs,
                  activeArcId: nextArcId,
                }
              },
              false,
              'arcs/remove',
            ),
          appendMsg: (arcId, input) => {
            const arc = get().arcs[arcId]
            if (!arc) {
              return undefined
            }

            const id = input.id ?? createId()
            const createdAt = input.createdAt ?? new Date().toISOString()
            const status: MsgStatus = input.status ?? 'complete'

            const msg: Msg = {
              id,
              arcId,
              authorId: input.authorId,
              authorRole: input.authorRole,
              content: input.content,
              createdAt,
              updatedAt: createdAt,
              status,
              nymId: input.nymId,
            }

            set(
              (state) => ({
                msgs: {
                  ...state.msgs,
                  [id]: msg,
                },
                arcs: {
                  ...state.arcs,
                  [arcId]: {
                    ...state.arcs[arcId],
                    msgIds: [...state.arcs[arcId].msgIds, id],
                    updatedAt: createdAt,
                  },
                },
                scheduler: applySchedulerMsgUpdate(state, msg),
              }),
              false,
              'msgs/append',
            )

            return id
          },
          updateMsg: (msgId, updates) =>
            set(
              (state) => {
                const existing = state.msgs[msgId]
                if (!existing) {
                  return {}
                }

                return {
                  msgs: {
                    ...state.msgs,
                    [msgId]: {
                      ...existing,
                      ...updates,
                      id: existing.id,
                    },
                  },
                }
              },
              false,
              'msgs/update',
            ),
          createNym: (input) => {
            const id = input?.id ?? createId()
            const now = new Date().toISOString()

            const nym: Nym = {
              id,
              name: input?.name?.trim() || 'New Nym',
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
                nyms: {
                  ...state.nyms,
                  [nym.id]: nym,
                },
                scheduler: {
                  ...state.scheduler,
                  nymStates: {
                    ...state.scheduler.nymStates,
                    [nym.id]: createNymSchedulerState(state.scheduler.msgCounter),
                  },
                },
              }),
              false,
              'nyms/create',
            )

            return nym.id
          },
          updateNym: (nymId, updates) =>
            set(
              (state) => {
                const existing = state.nyms[nymId]
                if (!existing) {
                  return {}
                }

                return {
                  nyms: {
                    ...state.nyms,
                    [nymId]: {
                      ...existing,
                      ...updates,
                      id: existing.id,
                      updatedAt: new Date().toISOString(),
                    },
                  },
                }
              },
              false,
              'nyms/update',
            ),
          deleteNym: (nymId) =>
            set(
              (state) => {
                if (!state.nyms[nymId]) {
                  return {}
                }

                const rest = { ...state.nyms }
                delete rest[nymId]

                const updatedArcs = Object.fromEntries(
                  Object.entries(state.arcs).map(([id, arc]) => [
                    id,
                    {
                      ...arc,
                      participantIds: arc.participantIds.filter(
                        (participantId) => participantId !== nymId,
                      ),
                      activeNymIds: arc.activeNymIds.filter(
                        (participantId) => participantId !== nymId,
                      ),
                    },
                  ]),
                )

                const remainingSchedulerStates = { ...state.scheduler.nymStates }
                delete remainingSchedulerStates[nymId]

                return {
                  nyms: rest,
                  arcs: updatedArcs,
                  scheduler: {
                    ...state.scheduler,
                    nymStates: remainingSchedulerStates,
                  },
                }
              },
              false,
              'nyms/delete',
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
                      arcId: input.arcId,
                      authorId: input.authorId,
                      msgId: input.msgId,
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

          const typed = persist, ...rests PersistedState
          const { scheduler, ui, ...rest } = typed

          const mergedNyms = {
            ...(restntSta ?? {}),
            ...(rest.nyms ?? {}),
          }
          const mergedArcs = {
            ...(restntSta ?? {}),
            ...(rest.arcs ?? {}),
          }
          const mergedMsgs = {
            ...(restntSta ?? {}),
            ...(rest.msgs ?? {}),
          }

          const mergedNymStates = Object.keys(mergedNyms).reduce<NymSchedulerStateMap>((acc, nymId) => {
            const existing = currentState.scheduler.nymStates[nymId]
            acc[nymId] =
              existing ?? createNymSchedulerState(currentState.scheduler.msgCounter)
            return acc
          }, {})

          return {
            ...currentState,
            nyms: mergedNyms,
            arcs: mergedArcs,
            msgs: mergedMrest
            activeArcId: rest.activeArcId ?? currentState.activeArcId,
            scheduler: {
              ...currentState.scheduler,
              settings: {
                ...currentState.scheduler.settings,
                ...(scheduler?.settings ?? {}),
              },
              nymStates: mergedNymStates,
            },
            ui: {
              ...currentState.ui,
              activeView: ui?.activeView ?? currentState.ui.activeView,
            },
          }
        },
        partialize: (state): PersistedState => ({
          nyms: state.nyms,
          arcs: state.arcs,
          msgs: state.msgs,
          activeArcId: state.activeArcId,
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

          const mergedNyms = {
            ...(typedyms, ?? {})
            ...(typed.nyms ?? {}),
          }
          const mergedArcs = {
            ...(typedrcs, ?? {})
            ...(typed.arcs ?? {}),
          }
          const mergedMsgs = {
            ...(typedsgs, ?? {})
            ...(typed.msgs ?? {}),
          }

          const mergedNymStates = Object.keys(mergedNyms).reduce<NymSchedulerStateMap>((acc, nymId) => {
            acc[nymId] =
              base.scheduler.nymStates[nymId] ??
              createNymSchedulerState(base.scheduler.msgCounter)
            return acc
          }, {})

          return {
            nyms: mergedNyms,
            arcs: mergedArcs,
            msgs: mergedMsyp,d
            activeArcId: typed.activeArcId ?? base.activeArcId,
            scheduler: {
              ...base.scheduler,
              settings: {
                ...base.scheduler.settings,
                ...(typed.scheduler?.settings ?? {}),
              },
              queue: [],
              inFlightIds: [],
              nymStates: mergedNymStates,
              msgCounter: base.scheduler.msgCounter,
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
