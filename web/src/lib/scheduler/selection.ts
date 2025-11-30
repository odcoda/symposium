import type { SchedulerRequest} from '@/types'
import type { NymSchedulerStateMap, ScheduleParams } from '@/types/scheduler'

import { MIN_SELECTION_TEMPERATURE, sampleIndexFromLogits } from './math'


export const scheduleNyms = ({
  queue,
  nyms,
  nymStates,
  activeRequestIds,
  settings,
}: ScheduleParams): { requests: SchedulerRequest[], newQueue: SchedulerRequest[], newNymStates: NymSchedulerStateMap } => {
  const slots = settings.maxConcurrent - activeRequestIds.size

  if (slots <= 0) {
    return { requests: [], newQueue: queue, newNymStates: nymStates } // nothing to do
  }

  const newQueue = queue.filter((request) => {
    if (settings.responsePacing === 'relaxed') {
      return request.authorId === "user"
    } else if (settings.responsePacing === 'steady') {
      return request.authorId !== "timer"
    } else {
      return true
    }
  })

  if (newQueue.length === 0) {
    return { requests: [], newQueue: [], newNymStates: nymStates } // nothing to do
  }

  const requests: SchedulerRequest[] = []
  const safeTemperature = Math.max(MIN_SELECTION_TEMPERATURE, settings.selectionTemperature)
  const nymIds = Array.from(Object.keys(nyms))
  while (requests.length < slots && newQueue.length > 0) {
    const logits = nymIds.map((nymId) =>
      nyms[nymId].eagerness +
    nymStates[nymId].mentionScore + nymStates[nymId].politenessScore)
    console.log("[scheduleNyms] logits", logits)
    const req = newQueue.shift()!
    const selectedIndex = sampleIndexFromLogits(logits, safeTemperature)
    const nymId = nymIds[selectedIndex]
    console.log("[scheduleNyms] selected: ", nyms[nymId].name)
    requests.push({
      ...req,
      authorId: nymId,
    })
  }
  return { requests, newQueue, newNymStates: nymStates }
}
