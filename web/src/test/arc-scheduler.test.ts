import { describe, expect, it, vi } from 'vitest'

import { logitsToProbabilities, scheduleNyms } from '@/lib/scheduler'
import {
  applySchedulerMsgUpdate,
  createNymSchedulerState,
} from '@/stores/app-store'
import type { AppView, Msg, Nym, SchedulerRequest, SchedulerSettings } from '@/types'
import type { NymSchedulerStateMap } from '@/types/scheduler'

vi.mock('@/lib/scheduler/math', async () => {
  const actual = await vi.importActual<typeof import('@/lib/scheduler/math')>('@/lib/scheduler/math')
  return {
    ...actual,
    sampleIndexFromLogits: (logits: number[]): number => {
      if (!logits.length) {
        return -1
      }

      const maxLogit = Math.max(...logits)
      return logits.findIndex((logit) => logit === maxLogit)
    },
  }
})

describe('arc scheduling algorithm', () => {
  it('updates logits and probabilities as msgs arrive', () => {
    const timestamp = '2024-01-01T00:00:00.000Z'
    const nyms: Record<string, Nym> = {
      alpha: {
        id: 'alpha',
        name: 'Alpha',
        description: '',
        color: '#ff0000',
        model: 'test-model',
        prompt: 'Test alpha',
        temperature: 0.8,
        eagerness: 0.6,
        politenessPenalty: 0.3,
        politenessHalfLife: 2,
        mentionBoost: 0.5,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      beta: {
        id: 'beta',
        name: 'Beta',
        description: '',
        color: '#00ff00',
        model: 'test-model',
        prompt: 'Test beta',
        temperature: 0.8,
        eagerness: 0.4,
        politenessPenalty: 0.2,
        politenessHalfLife: 4,
        mentionBoost: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    }

    const schedulerSettings: SchedulerSettings = {
      maxConcurrent: 2,
      responseDelayMs: 0,
      responsePacing: 'steady',
      autoStart: true,
      selectionTemperature: 1,
      politenessDecayMultiplier: 0.8,
    }

    const createQueue = (): SchedulerRequest[] => [
      {
        id: 'user-request',
        arcId: 'arc',
        authorId: 'user',
        msgId: 'user-msg',
        enqueuedAt: 0,
        status: 'queued',
      },
    ]

    const baseState = {
      nyms,
      arcs: {},
      msgs: {},
      activeArcId: null,
      scheduler: {
        settings: schedulerSettings,
        queue: [] as SchedulerRequest[],
        inFlightIds: [] as string[],
        nymStates: {
          alpha: createNymSchedulerState(0),
          beta: createNymSchedulerState(0),
        } as NymSchedulerStateMap,
        msgCounter: 0,
      },
      ui: { activeView: 'arcs' as AppView, isSettingsOpen: false },
    }

    const recordStep = (state: typeof baseState) => {
      const logits = Object.keys(state.nyms).map((nymId) => {
        const nym = state.nyms[nymId]
        const nymState = state.scheduler.nymStates[nymId]
        return nym.eagerness + nymState.mentionScore + nymState.politenessScore
      })
      const probabilities = logitsToProbabilities(
        logits,
        state.scheduler.settings.selectionTemperature,
      )
      const { requests } = scheduleNyms({
        queue: createQueue(),
        nyms: state.nyms,
        nymStates: state.scheduler.nymStates,
        activeRequestIds: new Set(),
        settings: state.scheduler.settings,
      })

      return { logits, probabilities, selection: requests[0]?.authorId ?? null }
    }

    const testMsgs: Array<Msg> = [
      {
        id: 'm1',
        arcId: 'arc',
        authorId: 'user',
        authorRole: 'user',
        content: 'Hey Beta, status update?',
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'complete',
      },
      {
        id: 'm2',
        arcId: 'arc',
        authorId: 'user',
        authorRole: 'user',
        content: 'Alpha should weigh in too.',
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'complete',
      },
      {
        id: 'm3',
        arcId: 'arc',
        authorId: 'beta',
        authorRole: 'assistant',
        content: 'Here is my update.',
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'complete',
      },
      {
        id: 'm4',
        arcId: 'arc',
        authorId: 'user',
        authorRole: 'user',
        content: 'Beta, please respond again!',
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'complete',
      },
    ]
    const recorded = [recordStep(baseState)]
    let state = baseState
    testMsgs.forEach((msg) => {
      state = {
        ...state,
        scheduler: applySchedulerMsgUpdate(state, msg),
      }
      recorded.push(recordStep(state))
    })

    const expectedLogits = [
      [0.6, 0.4],
      [0.6, 1.4],
      [1.1, 1.4],
      [1.1, 0.2],
      [1.1, 1.2654565735594057],
    ]

    const expectedProbabilities = [
      [0.5498339973124778, 0.4501660026875221],
      [0.3100255188723876, 0.6899744811276125],
      [0.4255574831883411, 0.5744425168116589],
      [0.710949502625004, 0.289050497374996],
      [0.45872996396905485, 0.5412700360309451],
    ]

    recorded.forEach(({ logits, probabilities }, index) => {
      logits.forEach((value, logitIndex) => {
        expect(value).toBeCloseTo(expectedLogits[index][logitIndex], 9)
      })

      probabilities.forEach((value, probabilityIndex) => {
        expect(value).toBeCloseTo(
          expectedProbabilities[index][probabilityIndex],
          9,
        )
      })
    })

    const expectedSelections = ['alpha', 'beta', 'beta', 'alpha', 'beta']
    recorded.forEach(({ selection }, index) => {
      expect(selection).toBe(expectedSelections[index])
    })
  })
})
