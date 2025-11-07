import { describe, expect, it } from 'vitest'

import {
  calculateRequestLogits,
  logitsToProbabilities,
} from '@/features/conversations/schedulerMath'
import {
  applySchedulerMessageUpdate,
  createPersonalitySchedulerState,
} from '@/stores/app-store'
import type { Message, Personality, RequestQueueItem, SchedulerSettings } from '@/types'

describe('conversation scheduling algorithm', () => {
  it('updates logits and probabilities as messages arrive', () => {
    const timestamp = '2024-01-01T00:00:00.000Z'
    const personalities: Record<string, Personality> = {
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
      triggerMode: 'medium',
      selectionTemperature: 1,
      politenessDecayMultiplier: 0.8,
    }

    const buildRequest = (authorId: string): RequestQueueItem => ({
      id: `${authorId}-request`,
      authorId,
      conversationId: 'conversation',
      messageId: `${authorId}-message`,
      enqueuedAt: 0,
      status: 'queued',
    })

    const queuedRequests = [buildRequest('alpha'), buildRequest('beta')]

    const baseState = {
      personalities,
      conversations: {},
      messages: {},
      activeConversationId: null,
      scheduler: {
        settings: schedulerSettings,
        queue: [],
        inFlightIds: [],
        personalityStates: {
          alpha: createPersonalitySchedulerState(0),
          beta: createPersonalitySchedulerState(0),
        },
        messageCounter: 0,
      },
      ui: { activeView: 'conversations', isSettingsOpen: false },
    }

    const recordStep = (state: typeof baseState) => {
      const logits = calculateRequestLogits(
        queuedRequests,
        state.personalities,
        state.scheduler.personalityStates,
      )
      const probabilities = logitsToProbabilities(
        logits,
        state.scheduler.settings.selectionTemperature,
      )
      return { logits, probabilities }
    }

    const recorded = [recordStep(baseState)]

    const userMentionsBeta: Message = {
      id: 'm1',
      conversationId: 'conversation',
      authorId: 'user',
      authorRole: 'user',
      content: 'Hey Beta, status update?',
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'complete',
    }

    const afterUserMentionsBeta = {
      ...baseState,
      scheduler: applySchedulerMessageUpdate(baseState, userMentionsBeta),
    }
    recorded.push(recordStep(afterUserMentionsBeta))

    const userMentionsAlpha: Message = {
      id: 'm2',
      conversationId: 'conversation',
      authorId: 'user',
      authorRole: 'user',
      content: 'Alpha should weigh in too.',
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'complete',
    }

    const afterUserMentionsAlpha = {
      ...afterUserMentionsBeta,
      scheduler: applySchedulerMessageUpdate(afterUserMentionsBeta, userMentionsAlpha),
    }
    recorded.push(recordStep(afterUserMentionsAlpha))

    const betaResponds: Message = {
      id: 'm3',
      conversationId: 'conversation',
      authorId: 'beta',
      authorRole: 'assistant',
      content: 'Here is my update.',
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'complete',
    }

    const afterBetaResponds = {
      ...afterUserMentionsAlpha,
      scheduler: applySchedulerMessageUpdate(afterUserMentionsAlpha, betaResponds),
    }
    recorded.push(recordStep(afterBetaResponds))

    const userRequestsBetaAgain: Message = {
      id: 'm4',
      conversationId: 'conversation',
      authorId: 'user',
      authorRole: 'user',
      content: 'Beta, please respond again!',
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'complete',
    }

    const afterUserRequestsBetaAgain = {
      ...afterBetaResponds,
      scheduler: applySchedulerMessageUpdate(
        afterBetaResponds,
        userRequestsBetaAgain,
      ),
    }
    recorded.push(recordStep(afterUserRequestsBetaAgain))

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
  })
})
