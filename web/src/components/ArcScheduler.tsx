import { useCallback, useEffect, useMemo, useRef } from 'react'

import { useOpenRouterClient } from '@/hooks/useOpenRouterClient'
import { executeChatCompletion } from '@/lib/openrouter/executor'
import { deriveAvailableSlots, selectRequestsForSlots } from '@/lib/scheduler'
import { useAppStore } from '@/stores/app-store'
import type {
  Msg,
  OpenRouterChatCompletionRequest,
  OpenRouterChatMsg,
  RequestQueueItem,
} from '@/types'

const buildPromptMsgs = (arcId: string, msgId: string) => {
  const state = useAppStore.getState()
  const arc = state.arcs[arcId]
  if (!arc) {
    return null
  }

  const msgs: Msg[] = arc.msgIds
    .map((id) => state.msgs[id])
    .filter((msg): msg is Msg => Boolean(msg))

  const insertionIndex = msgs.findIndex((msg) => msg.id === msgId)
  if (insertionIndex === -1) {
    return msgs
  }

  return msgs.slice(0, insertionIndex + 1)
}

const markMsgStreaming = (msgId: string) => {
  const { updateMsg } = useAppStore.getState().actions
  updateMsg(msgId, { status: 'streaming' })
}

const appendNymMsg = (
  request: RequestQueueItem,
  content: string,
) => {
  const state = useAppStore.getState()
  const { appendMsg, updateMsg, removeQueueItem } = state.actions
  const nym = state.nyms[request.authorId]
  const now = new Date().toISOString()

  const msgId = appendMsg(request.arcId, {
    authorId: request.authorId,
    authorRole: 'assistant',
    content,
    createdAt: now,
    nymId: nym?.id,
    status: 'complete',
  })

  updateMsg(request.msgId, { status: 'complete' })
  removeQueueItem(request.id)
  return msgId
}

const failRequest = (request: RequestQueueItem, error: string) => {
  const { updateMsg, updateQueueItem, removeQueueItem } = useAppStore.getState().actions
  updateMsg(request.msgId, {
    status: 'error',
    content: `${useAppStore.getState().msgs[request.msgId]?.content ?? ''}\n\n(LLM error: ${error})`,
  })
  updateQueueItem(request.id, { status: 'error', error })
  removeQueueItem(request.id)
}

export const ArcScheduler = () => {
  const queue = useAppStore((state) => state.scheduler.queue)
  const inFlightIds = useAppStore((state) => state.scheduler.inFlightIds)
  const settings = useAppStore((state) => state.scheduler.settings)
  const nymStates = useAppStore((state) => state.scheduler.nymStates)
  const nyms = useAppStore((state) => state.nyms)
  const markInFlight = useAppStore((state) => state.actions.markRequestInFlight)
  const updateQueueItem = useAppStore((state) => state.actions.updateQueueItem)
  const openRouterClient = useOpenRouterClient()

  const activeRequests = useRef(new Set<string>())

  const startRequest = useCallback(
    async (request: RequestQueueItem) => {
      try {
        console.log("processing request", request)
        activeRequests.current.add(request.id)
        markInFlight(request.id)
        updateQueueItem(request.id, { status: 'in-flight' })
        markMsgStreaming(request.msgId)

        const msgs = buildPromptMsgs(request.arcId, request.msgId)
        if (!msgs) {
          failRequest(request, 'Arc not found')
          return
        }

        const nym = useAppStore.getState().nyms[request.authorId]
        if (!nym) {
          failRequest(request, 'Nym not found')
          return
        }

        const arc = useAppStore.getState().arcs[request.arcId]
        if (!arc) {
          failRequest(request, 'Arc not found')
          return
        }

        const promptMsgs: OpenRouterChatMsg[] = msgs.map((msg) => {
          const nyms = useAppStore.getState().nyms
          if (msg.authorRole === 'user') {
            return { role: 'user', content: msg.content }
          }

          if (msg.authorRole === 'assistant') {
            return {
              role: 'assistant',
              content: msg.content,
              name: nyms[msg.authorId ?? '']?.name ?? undefined,
            }
          }

          return { role: 'system', content: msg.content }
        })

        const requestBody: OpenRouterChatCompletionRequest = {
          model: nym.model,
          messages: [
            {
              role: 'system',
              content: nym.prompt || 'You are a helpful collaborator.',
            },
            ...promptMsgs,
          ],
          temperature: nym.temperature,
          metadata: {
            arcId: arc.id,
            nymId: nym.id,
          },
        }

        let assembledContent = ''
        const result = await executeChatCompletion({
          client: openRouterClient,
          request: requestBody,
          onContentChunk: (chunk) => {
            assembledContent += chunk
          },
        })

        appendNymMsg(request, assembledContent || result.content)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown scheduler error'
        failRequest(request, message)
      } finally {
        activeRequests.current.delete(request.id)
      }
    },
    [markInFlight, openRouterClient, updateQueueItem],
  )

  const queuedItems = useMemo(
    () => queue.filter((item) => item.status === 'queued'),
    [queue],
  )

  const inFlightCount = inFlightIds.length

  useEffect(() => {
    if (!settings.autoStart) {
      return
    }

    if (!queuedItems.length) {
      return
    }

    const arcId = queuedItems[0]?.arcId
    if (!arcId) {
      return
    }

    const arcExists = Boolean(useAppStore.getState().arcs[arcId])
    if (!arcExists) {
      return
    }

    const slots = deriveAvailableSlots(settings.maxConcurrent, inFlightCount)
    if (slots <= 0) {
      return
    }

    const nextBatch = selectRequestsForSlots({
      queue: queuedItems,
      nyms,
      nymStates,
      selectionTemperature: settings.selectionTemperature,
      slots,
      activeRequestIds: activeRequests.current,
    })

    nextBatch.forEach((request) => {
      if (activeRequests.current.has(request.id)) {
        return
      }

      startRequest(request)
    })
  }, [
    inFlightCount,
    nymStates,
    nyms,
    queuedItems,
    settings.autoStart,
    settings.maxConcurrent,
    settings.selectionTemperature,
    startRequest,
  ])

  return null
}
