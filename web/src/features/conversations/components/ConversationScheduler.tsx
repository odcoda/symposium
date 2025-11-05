import { useCallback, useEffect, useMemo, useRef } from 'react'

import { useOpenRouterClient } from '@/hooks/useOpenRouterClient'
import { executeChatCompletion } from '@/lib/openrouter/executor'
import { useAppStore } from '@/stores/app-store'
import type {
  Message,
  OpenRouterChatCompletionRequest,
  OpenRouterChatMessage,
  RequestQueueItem,
} from '@/types'

const buildPromptMessages = (conversationId: string, messageId: string) => {
  const state = useAppStore.getState()
  const conversation = state.conversations[conversationId]
  if (!conversation) {
    return null
  }

  const messages: Message[] = conversation.messageIds
    .map((id) => state.messages[id])
    .filter((message): message is Message => Boolean(message))

  const insertionIndex = messages.findIndex((message) => message.id === messageId)
  if (insertionIndex === -1) {
    return messages
  }

  return messages.slice(0, insertionIndex + 1)
}

const shouldAutoRespond = (conversationId: string) => {
  const state = useAppStore.getState()
  const conversation = state.conversations[conversationId]
  if (!conversation) {
    return false
  }

  const settings = state.scheduler.settings
  if (!settings.autoStart) {
    return false
  }

  return true
}

const deriveAvailableSlots = () => {
  const state = useAppStore.getState()
  const activeCount = state.scheduler.inFlightIds.length
  const { maxConcurrent } = state.scheduler.settings
  return Math.max(0, maxConcurrent - activeCount)
}

const markMessageStreaming = (messageId: string) => {
  const { updateMessage } = useAppStore.getState().actions
  updateMessage(messageId, { status: 'streaming' })
}

const appendPersonalityMessage = (
  request: RequestQueueItem,
  content: string,
) => {
  const state = useAppStore.getState()
  const { appendMessage, updateMessage, removeQueueItem } = state.actions
  const personality = state.personalities[request.personalityId]
  const now = new Date().toISOString()

  const messageId = appendMessage(request.conversationId, {
    authorId: personality?.id ?? request.personalityId,
    authorRole: 'personality',
    content,
    createdAt: now,
    personalityId: personality?.id,
    status: 'complete',
  })

  updateMessage(request.messageId, { status: 'complete' })
  removeQueueItem(request.id)
  return messageId
}

const failRequest = (request: RequestQueueItem, error: string) => {
  const { updateMessage, updateQueueItem, removeQueueItem } = useAppStore.getState().actions
  updateMessage(request.messageId, {
    status: 'error',
    content: `${useAppStore.getState().messages[request.messageId]?.content ?? ''}\n\n(LLM error: ${error})`,
  })
  updateQueueItem(request.id, { status: 'error', error })
  removeQueueItem(request.id)
}

export const ConversationScheduler = () => {
  const queue = useAppStore((state) => state.scheduler.queue)
  const settings = useAppStore((state) => state.scheduler.settings)
  const markInFlight = useAppStore((state) => state.actions.markRequestInFlight)
  const updateQueueItem = useAppStore((state) => state.actions.updateQueueItem)
  const openRouterClient = useOpenRouterClient()

  const activeRequests = useRef(new Set<string>())

  const startRequest = useCallback(
    async (request: RequestQueueItem) => {
      try {
        activeRequests.current.add(request.id)
        markInFlight(request.id)
        updateQueueItem(request.id, { status: 'in-flight' })
        markMessageStreaming(request.messageId)

        const messages = buildPromptMessages(request.conversationId, request.messageId)
        if (!messages) {
          failRequest(request, 'Conversation not found')
          return
        }

        const personality = useAppStore.getState().personalities[request.personalityId]
        if (!personality) {
          failRequest(request, 'Personality not found')
          return
        }

        const conversation = useAppStore.getState().conversations[request.conversationId]
        if (!conversation) {
          failRequest(request, 'Conversation not found')
          return
        }

        const promptMessages: OpenRouterChatMessage[] = messages.map((message) => {
          const personalities = useAppStore.getState().personalities
          if (message.authorRole === 'user') {
            return { role: 'user', content: message.content }
          }

          if (message.authorRole === 'personality') {
            return {
              role: 'assistant',
              content: message.content,
              name: personalities[message.personalityId ?? '']?.name ?? undefined,
            }
          }

          return { role: 'system', content: message.content }
        })

        const requestBody: OpenRouterChatCompletionRequest = {
          model: personality.model,
          messages: [
            {
              role: 'system',
              content: personality.prompt || 'You are a helpful collaborator.',
            },
            ...promptMessages,
          ],
          temperature: personality.temperature,
          metadata: {
            conversationId: conversation.id,
            personalityId: personality.id,
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

        appendPersonalityMessage(request, assembledContent || result.content)
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

  useEffect(() => {
    if (!settings.autoStart) {
      return
    }

    if (!queuedItems.length) {
      return
    }

    if (!shouldAutoRespond(queuedItems[0].conversationId)) {
      return
    }

    const slots = deriveAvailableSlots()
    if (slots <= 0) {
      return
    }

    const nextBatch = queuedItems.slice(0, slots)
    nextBatch.forEach((request) => {
      if (activeRequests.current.has(request.id)) {
        return
      }

      startRequest(request)
    })
  }, [queuedItems, settings.autoStart, startRequest])

  return null
}
