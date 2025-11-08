import type { Personality, RequestQueueItem } from '@/types'
import type { PersonalitySchedulerState } from '@/types/scheduler'

import { MIN_SELECTION_TEMPERATURE, sampleIndexFromLogits } from './math'

export const calculateRequestLogits = (
  requests: Pick<RequestQueueItem, 'authorId'>[],
  personalities: Record<string, Personality>,
  personalityStates: Record<string, PersonalitySchedulerState | undefined>,
): number[] =>
  requests.map((request) => {
    const personality = personalities[request.authorId]
    const state = personalityStates[request.authorId]

    if (!personality) {
      return Number.NEGATIVE_INFINITY
    }

    const mentionScore = state?.mentionScore ?? 0
    const politenessScore = state?.politenessScore ?? 0
    const baseEagerness = personality.eagerness ?? 0

    return baseEagerness + mentionScore + politenessScore
  })

export interface SelectRequestsForSlotsParams {
  queue: RequestQueueItem[]
  personalities: Record<string, Personality>
  personalityStates: Record<string, PersonalitySchedulerState | undefined>
  selectionTemperature: number
  slots: number
  activeRequestIds?: Iterable<string>
}

export const deriveAvailableSlots = (maxConcurrent: number, activeCount: number): number =>
  Math.max(0, maxConcurrent - activeCount)

export const selectRequestsForSlots = ({
  queue,
  personalities,
  personalityStates,
  selectionTemperature,
  slots,
  activeRequestIds,
}: SelectRequestsForSlotsParams): RequestQueueItem[] => {
  if (slots <= 0) {
    return []
  }

  const activeSet = new Set(activeRequestIds ?? [])
  const candidates = queue.filter((item) => {
    if (item.status !== 'queued') {
      return false
    }

    if (activeSet.has(item.id)) {
      return false
    }

    return Boolean(personalities[item.authorId])
  })

  const workingList = [...candidates]
  const selections: RequestQueueItem[] = []
  const safeTemperature = Math.max(MIN_SELECTION_TEMPERATURE, selectionTemperature)

  while (selections.length < slots && workingList.length > 0) {
    const logits = calculateRequestLogits(workingList, personalities, personalityStates)
    const selectedIndex = sampleIndexFromLogits(logits, safeTemperature)
    if (selectedIndex < 0) {
      break
    }

    const [selected] = workingList.splice(selectedIndex, 1)
    if (selected) {
      selections.push(selected)
    }
  }

  return selections
}
