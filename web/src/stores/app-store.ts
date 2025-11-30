import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'

import type {
  AppView,
  Arc,
  PreArc,
  PreMsg,
  PreNym,
  Msg,
  Nym,
  PreSchedulerRequest,
  SchedulerRequest,
  SchedulerSettings,
} from '@/types'
import type { NymSchedulerState, NymSchedulerStateMap } from '@/types/scheduler'
import { assert } from '@/utils/debug'
import { createId } from '@/utils/id'
import { resolveStorage } from '@/utils/storage'

const STORE_KEY = 'symposium-app-state'
const STORE_VERSION = 2

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
  queue: SchedulerRequest[]
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
  // UI
  setActiveView: (view: AppView) => void
  openSettings: () => void
  closeSettings: () => void
  setActiveArc: (arcId: string) => void
  // core data
  createArc: (input: PreArc) => string
  updateArc: (arcId: string, updates: Partial<Arc>) => void
  deleteArc: (arcId: string) => void
  createMsg: (input: PreMsg) => string
  updateMsg: (msgId: string, updates: Partial<Msg>) => void
  deleteMsg: (msgId: string) => void
  createNym: (input: PreNym) => string
  updateNym: (nymId: string, updates: Partial<Nym>) => void
  deleteNym: (nymId: string) => void
  // scheduler
  updateSchedulerSettings: (settings: Partial<SchedulerSettings>) => void
  createSchedulerRequest: (input: PreSchedulerRequest) => string
  updateSchedulerQueue: (queue: SchedulerRequest[]) => void
  updateSchedulerRequest: (requestId: string, updates: Partial<SchedulerRequest>) => void
  deleteSchedulerRequest: (requestId: string) => void
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

  const defaultArc: Arc = {
    id: defaultArcId,
    title: 'Welcome Chat',
    participantIds: ['user', defaultNym.id],
    msgIds: [],
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
    msgs: {},
    activeArcId: defaultArc.id,
    scheduler: {
      settings: {
        maxConcurrent: 2,
        responseDelayMs: 1200,
        responsePacing: 'steady',
        autoStart: false,
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
            const id = createId()
            const now = new Date().toISOString()

            const arc: Arc = {
              ...input,
              id,
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
          updateArc: (arcId, updates) =>
            set(
              (state) => {
                const existing = state.arcs[arcId]
                assert(existing, `attempted to update nonexistent arc ${arcId}`)
                return {
                  arcs: {
                    ...state.arcs,
                    [arcId]: {
                      ...existing,
                      ...updates,
                      id: existing.id,
                    },
                  },
                }
              },
              false,
              'arcs/update',
            ),
          deleteArc: (arcId) =>
            set(
              (state) => {
                assert(state.arcs[arcId], `attempted to delete nonexistent arc ${arcId}`)

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
              'arcs/delete',
            ),
          createMsg: (input) => {
            const arcId = input.arcId
            const arc = get().arcs[arcId]
            assert(arc, `attempted to create msg on nonexistent arc ${arcId}`)

            const id = createId()
            const now = new Date().toISOString()

            const msg: Msg = {
              ...input,
              id,
              createdAt: now,
              updatedAt: now,
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
                    updatedAt: now,
                  },
                },
                scheduler: applySchedulerMsgUpdate(state, msg),
              }),
              false,
              'msgs/create',
            )

            return id
          },
          updateMsg: (msgId, updates) =>
            set(
              (state) => {
                const existing = state.msgs[msgId]
                assert(existing, `attempted to update nonexistent msg ${msgId}`)

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
          deleteMsg: (msgId) =>
            set(
              (state) => {
                assert(state.msgs[msgId], `attempted to delete nonexistent msg ${msgId}`)

                const rest = { ...state.msgs }
                delete rest[msgId]
                return {
                  msgs: rest,
                }
              },
              false,
              'msgs/delete',
            ),
          createNym: (input) => {
            const id = createId()
            const now = new Date().toISOString()

            const nym: Nym = {
              ...input,
              id,
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
                assert(existing, `attempted to update nonexistent nym ${nymId}`)

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
                assert(state.nyms[nymId], `attempted to delete nonexistent nym ${nymId}`)

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
        createSchedulerRequest: (input) => {
          const id = createId()
          const enqueuedAt = Date.now()
          const status = 'queued'
          const error = ''

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
                    responseMsgId: undefined,
                    enqueuedAt,
                    status,
                    error,
                  },
                ],
              },
              }),
              false,
              'scheduler/queueRequest',
            )

            return id
          },
          updateSchedulerQueue: (newQueue) =>
            set(
              (state) => ({
                scheduler: {
                  ...state.scheduler,
                  queue: newQueue,
                },
              }),
              false,
              'scheduler/updateSchedulerQueue',
            ),
          updateSchedulerRequest: (requestId, updates) =>
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
          deleteSchedulerRequest: (requestId) =>
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

          const mergedNyms = {
            ...currentState.nyms,
            ...(rest.nyms ?? {}),
          }
          const mergedArcs = {
            ...currentState.arcs,
            ...(rest.arcs ?? {}),
          }
          const mergedMsgs = {
            ...currentState.msgs,
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
            msgs: mergedMsgs,
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
            ...base.nyms,
            ...(typed.nyms ?? {}),
          }
          const mergedArcs = {
            ...base.arcs,
            ...(typed.arcs ?? {}),
          }
          const mergedMsgs = {
            ...base.msgs,
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
            msgs: mergedMsgs,
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
