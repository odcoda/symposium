import type { OpenRouterModel } from '@/types'
import type { OpenRouterClient } from './client'

let cachedModels: OpenRouterModel[] | null = null
let inflightRequest: Promise<OpenRouterModel[]> | null = null

export const getOpenRouterModels = async (client: OpenRouterClient): Promise<OpenRouterModel[]> => {
  if (cachedModels) {
    return cachedModels
  }

  if (!inflightRequest) {
    inflightRequest = client
      .listModels()
      .then((response) => {
        cachedModels = response.data
        return cachedModels
      })
      .finally(() => {
        inflightRequest = null
      })
  }

  return inflightRequest
}

export const getOpenRouterModelIds = async (client: OpenRouterClient): Promise<string[]> => {
  const models = await getOpenRouterModels(client)
  return models.map((model) => model.id)
}
