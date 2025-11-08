import type { Nym, RequestQueueItem } from '@/types'
import type { NymSchedulerState } from '@/types/scheduler'

import { MIN_SELECTION_TEMPERATURE, sampleIndexFromLogits } from './math'

export const calculateRequestLogits = (
  requests: Pick<RequestQueueItem, 'authorId'>[],
  nyms: Record<string, Nym>,
  nymStates: Record<string, NymSchedulerState | undefined>,
): number[] =>
  requests.map((request) => {
    const nym = nyms[request.authorId]
    const state = nymStates[request.authorId]

    if (!nym) {
      return Number.NEGATIVE_INFINITY
    }

    const mentionScore = state?.mentionScore ?? 0
    const politenessScore = state?.politenessScore ?? 0
    const baseEagerness = nym.eagerness ?? 0

    return baseEagerness + mentionScore + politenessScore
  })

export interface SelectRequestsForSlotsParams {
  queue: RequestQueueItem[]
  nyms: Record<string, Nym>
  nymStates: Record<string, NymSchedulerState | undefined>
  selectionTemperature: number
  slots: number
  activeRequestIds?: Iterable<string>
}

export const deriveAvailableSlots = (maxConcurrent: number, activeCount: number): number =>
  Math.max(0, maxConcurrent - activeCount)

export const selectRequestsForSlots = ({
  queue,
  nyms,
  nymStates,
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

    return Boolean(nyms[item.authorId])
  })

  const workingList = [...candidates]
  const selections: RequestQueueItem[] = []
  const safeTemperature = Math.max(MIN_SELECTION_TEMPERATURE, selectionTemperature)

  while (selections.length < slots && workingList.length > 0) {
    const logits = calculateRequestLogits(workingList, nyms, nymStates)
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
