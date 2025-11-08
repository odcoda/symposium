export interface NymSchedulerState {
  mentionScore: number
  politenessScore: number
  lastUpdatedMsgIndex: number
  lastSpokeMsgIndex: number | null
}

export type NymSchedulerStateMap = Record<string, NymSchedulerState>
