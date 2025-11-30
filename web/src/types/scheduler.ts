import type { Nym, SchedulerRequest, SchedulerSettings } from './app'

export type NymSchedulerState = {
  mentionScore: number
  politenessScore: number
  lastUpdatedMsgIndex: number
  lastSpokeMsgIndex: number | null
}

export type NymSchedulerStateMap = Record<string, NymSchedulerState>

export type ScheduleParams = {
  queue: SchedulerRequest[]
  nyms: Record<string, Nym>
  nymStates: NymSchedulerStateMap
  activeRequestIds: Set<string>
  settings: SchedulerSettings
}
