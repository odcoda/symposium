import type { Personality, RequestQueueItem } from '@/types'
import type { PersonalitySchedulerState } from '@/stores/app-store'

export const MIN_SELECTION_TEMPERATURE = 0.05

export const calculateRequestLogits = (
  requests: Pick<RequestQueueItem, 'authorId'>[],
  personalities: Record<string, Personality>,
  personalityStates: Record<string, PersonalitySchedulerState | undefined>,
): number[] =>
  requests.map((request) => {
    const personality = personalities[request.authorId]
    const state = personalityStates[request.authorId]

    const mentionScore = state?.mentionScore ?? 0
    const politenessScore = state?.politenessScore ?? 0
    const baseEagerness = personality?.eagerness ?? 0

    return baseEagerness + mentionScore + politenessScore
  })

export const logitsToProbabilities = (logits: number[], temperature: number): number[] => {
  if (!logits.length) {
    return []
  }

  const safeTemperature = Math.max(MIN_SELECTION_TEMPERATURE, temperature)
  const maxLogit = Math.max(...logits)
  const weights = logits.map((logit) => Math.exp((logit - maxLogit) / safeTemperature))
  const totalWeight = weights.reduce((sum, value) => sum + value, 0)

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    const topIndices = logits
      .map((logit, index) => ({ logit, index }))
      .filter(({ logit }) => logit === maxLogit)

    if (!topIndices.length) {
      return logits.map(() => 0)
    }

    const sharedProbability = 1 / topIndices.length
    return logits.map((logit) => (logit === maxLogit ? sharedProbability : 0))
  }

  return weights.map((weight) => weight / totalWeight)
}

export const sampleIndexFromLogits = (logits: number[], temperature: number): number => {
  const probabilities = logitsToProbabilities(logits, temperature)
  if (!probabilities.length) {
    return -1
  }

  const totalProbability = probabilities.reduce((sum, value) => sum + value, 0)
  if (!Number.isFinite(totalProbability) || totalProbability <= 0) {
    return -1
  }

  const threshold = Math.random() * totalProbability
  let cumulative = 0

  for (let index = 0; index < probabilities.length; index += 1) {
    cumulative += probabilities[index]
    if (threshold <= cumulative) {
      return index
    }
  }

  return probabilities.length - 1
}
