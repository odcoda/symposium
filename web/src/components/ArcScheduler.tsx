import { useCallback, useEffect, useRef } from 'react'

import { useOpenRouterClient } from '@/hooks/useOpenRouterClient'
import { executeChatCompletion, fetchGenerationWithRetry } from '@/lib/openrouter/executor'
import { scheduleNyms } from '@/lib/scheduler'
import { makePrompt } from '@/lib/prompts'
import { useAppStore } from '@/stores/app-store'
import type {
  Msg,
  OpenRouterChatCompletionRequest,
  SchedulerRequest,
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
  updateMsg(msgId, { status: 'streaming', statusDetails: undefined })
}

const failRequest = (request: SchedulerRequest, error: string, responseMsgId?: string | null) => {
  const {
    updateMsg,
    updateSchedulerRequest: updateQueueItem,
    deleteSchedulerRequest: removeQueueItem,
  } = useAppStore.getState().actions

  const timestamp = new Date().toISOString()

  if (responseMsgId) {
    updateMsg(responseMsgId, {
      status: 'error',
      statusDetails: error,
      updatedAt: timestamp,
    })
    updateMsg(request.msgId, {
      status: 'complete',
      statusDetails: undefined,
      updatedAt: timestamp,
    })
  } else {
    updateMsg(request.msgId, {
      status: 'error',
      statusDetails: error,
      updatedAt: timestamp,
    })
  }
  updateQueueItem(request.id, { status: 'error', error })
  removeQueueItem(request.id)
}

export const ArcScheduler = () => {
  const queue = useAppStore((state) => state.scheduler.queue)
  const queueRequest = useAppStore((state) => state.actions.createSchedulerRequest)
  const settings = useAppStore((state) => state.scheduler.settings)
  const nymStates = useAppStore((state) => state.scheduler.nymStates)
  const nyms = useAppStore((state) => state.nyms)
  const arcs = useAppStore((state) => state.arcs)
  const updateQueue = useAppStore((state) => state.actions.updateSchedulerQueue)
  const updateQueueItem = useAppStore((state) => state.actions.updateSchedulerRequest)
  const removeQueueItem = useAppStore((state) => state.actions.deleteSchedulerRequest)
  const openRouterClient = useOpenRouterClient()

  const activeRequests = useRef(new Set<string>())

  const startRequest = useCallback(
    async (request: SchedulerRequest) => {
      let responseMsgId = request.responseMsgId ?? null
      try {
        console.log("[scheduler] handling request: ", request)
        activeRequests.current.add(request.id)
        updateQueueItem(request.id, { status: 'in-flight', error: undefined })
        markMsgStreaming(request.msgId)

        const nyms = useAppStore.getState().nyms
        const msgs = buildPromptMsgs(request.arcId, request.msgId)
        if (!msgs) {
          failRequest(request, 'Arc not found')
          return
        }

        const nym = nyms[request.authorId]
        if (!nym) {
          failRequest(request, 'Nym not found')
          return
        }

        const arc = useAppStore.getState().arcs[request.arcId]
        if (!arc) {
          failRequest(request, 'Arc not found')
          return
        }
        const requestBody: OpenRouterChatCompletionRequest = {
          model: nym.model,
          messages: makePrompt(nym, nyms, msgs),
          temperature: nym.temperature,
          metadata: {
            arcId: arc.id,
            nymId: nym.id,
          },
        }

        const actions = useAppStore.getState().actions
        if (!responseMsgId) {
          responseMsgId = actions.createMsg({
            arcId: request.arcId,
            authorId: nym.id,
            authorRole: 'assistant',
            nymId: nym.id,
            content: '',
            status: 'streaming',
          })
          updateQueueItem(request.id, { responseMsgId })
        } else {
          actions.updateMsg(responseMsgId, {
            status: 'streaming',
            statusDetails: undefined,
            updatedAt: new Date().toISOString(),
          })
        }

        let assembledContent = ''
        const completion = await executeChatCompletion({
          client: openRouterClient,
          request: requestBody,
          onContentChunk: (chunk) => {
            if (!chunk) {
              return
            }
            assembledContent += chunk
            if (responseMsgId) {
              actions.updateMsg(responseMsgId, {
                content: assembledContent,
                statusDetails: undefined,
                updatedAt: new Date().toISOString(),
              })
            }
          },
        })

        const finalContent = (assembledContent || '').trim()
        if (responseMsgId) {
          actions.updateMsg(responseMsgId, {
            content: finalContent.length ? finalContent : '(No response)',
            status: 'complete',
            statusDetails: undefined,
            updatedAt: new Date().toISOString(),
          })

          if (completion.response?.id && openRouterClient) {
            const responseId = completion.response.id
            void (async () => {
              const generation = await fetchGenerationWithRetry(
                openRouterClient,
                responseId,
              )
              if (generation) {
                actions.updateMsg(responseMsgId, {
                  generation,
                  updatedAt: new Date().toISOString(),
                })
              }
            })()
          }
        }

        actions.updateMsg(request.msgId, {
          status: 'complete',
          statusDetails: undefined,
          updatedAt: new Date().toISOString(),
        })
        removeQueueItem(request.id)

        const req = {
          arcId: arc.id,
          authorId: nym.id,
          msgId: responseMsgId,
        }
        console.log('[scheduling] queueing request after nym message completion ', req)
        queueRequest(req)

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown scheduler error'
        const queueItem = useAppStore
          .getState()
          .scheduler.queue.find((item) => item.id === request.id)
        const fallbackResponseId =
          responseMsgId ?? queueItem?.responseMsgId ?? request.responseMsgId ?? null
        failRequest(request, message, fallbackResponseId)
      } finally {
        activeRequests.current.delete(request.id)
      }
    },
    [openRouterClient, removeQueueItem, updateQueueItem],
  )

  useEffect(() => {
    console.log("[scheduler] checking")
    if (!queue.length) {
      return
    }
    const out = scheduleNyms({
      queue,
      nyms,
      arcs,
      nymStates,
      activeRequestIds: activeRequests.current,
      settings,
    })

    out.requests.forEach(startRequest)

    updateQueue(out.newQueue)
  }, [
    arcs,
    nymStates,
    nyms,
    queue,
    settings,
    startRequest,
  ])

  return null
}
