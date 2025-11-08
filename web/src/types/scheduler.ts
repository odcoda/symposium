export interface PersonalitySchedulerState {
  mentionScore: number
  politenessScore: number
  lastUpdatedMessageIndex: number
  lastSpokeMessageIndex: number | null
}

export type ConversationSchedulerState = Record<string, PersonalitySchedulerState>
export type SchedulerState = Record<string, Record<string, ConversationSchedulerState>>
