import { useEffect, useMemo, useRef } from 'react'

import { useAppStore } from '@/stores/app-store'
import type { Conversation, Message, Personality } from '@/types'

import { MessageComposer } from './MessageComposer'
import styles from './ConversationsView.module.css'

const formatTimestamp = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  })
}

const getAuthorName = (
  message: Message,
  personalities: Record<string, Personality>,
): string => {
  if (message.authorRole === 'user') {
    return 'You'
  }

  if (message.authorRole === 'system') {
    return 'System'
  }

  if (message.authorRole === 'personality') {
    const personality = personalities[message.personalityId ?? message.authorId]
    return personality?.name ?? 'Personality'
  }

  return 'Unknown'
}

const summariseParticipants = (conversation: Conversation, personalities: Record<string, Personality>) => {
  const names = conversation.activePersonalityIds
    .map((id) => personalities[id]?.name)
    .filter(Boolean)
  return names.length ? names.join(', ') : 'No personalities yet'
}

export const ConversationsView = () => {
  const conversations = useAppStore((state) => state.conversations)
  const messages = useAppStore((state) => state.messages)
  const personalities = useAppStore((state) => state.personalities)
  const activeConversationId = useAppStore((state) => state.activeConversationId)
  const { setActiveConversation, createConversation } = useAppStore((state) => state.actions)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const conversationList = useMemo(() => {
    return Object.values(conversations).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
  }, [conversations])

  const activeConversation = activeConversationId
    ? conversations[activeConversationId]
    : conversationList[0]

  const activeMessages = useMemo(() => {
    if (!activeConversation) {
      return []
    }

    return activeConversation.messageIds
      .map((id) => messages[id])
      .filter((message): message is Message => Boolean(message))
  }, [activeConversation, messages])

  useEffect(() => {
    if (!messagesEndRef.current) {
      return
    }

    messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeConversation?.id, activeMessages.length])

  const handleCreateConversation = () => {
    const newConversationId = createConversation({
      title: 'New Conversation',
      participantIds: ['user'],
    })
    setActiveConversation(newConversationId)
  }

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Conversations</h2>
          <button type="button" className={styles.newConversationButton} onClick={handleCreateConversation}>
            New
          </button>
        </div>
        <ul className={styles.conversationList}>
          {conversationList.map((conversation) => {
            const isActive = conversation.id === activeConversation?.id
            const primaryMessageId = conversation.messageIds.at(-1)
            const primaryMessage = primaryMessageId ? messages[primaryMessageId] : undefined
            const preview = primaryMessage?.content.slice(0, 80) ?? 'No messages yet'

            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={[
                    styles.conversationButton,
                    isActive ? styles.conversationButtonActive : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setActiveConversation(conversation.id)}
                >
                  <span className={styles.conversationTitle}>{conversation.title}</span>
                  <span className={styles.conversationMeta}>
                    {formatTimestamp(conversation.updatedAt)} · {preview}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>
      <section className={styles.workspace}>
        {activeConversation ? (
          <>
            <div className={styles.conversationHeader}>
              <h2>{activeConversation.title}</h2>
              <span className={styles.metadata}>
                {summariseParticipants(activeConversation, personalities)}
              </span>
            </div>
            <div className={styles.conversationBody}>
              <div className={styles.messages}>
                {activeMessages.map((message) => (
                  <article key={message.id} className={styles.messageCard}>
                    <header className={styles.messageHeader}>
                      <span className={styles.messageAuthor}>
                        {getAuthorName(message, personalities)}
                      </span>
                      <span className={styles.messageTimestamp}>{formatTimestamp(message.createdAt)}</span>
                    </header>
                    <p>{message.content}</p>
                    <span className={styles.messageStatus}>{message.status}</span>
                  </article>
                ))}
                {activeMessages.length === 0 ? (
                  <div className={styles.emptyState}>No messages yet. Start the conversation!</div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
              <MessageComposer conversationId={activeConversation.id} />
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            Select a conversation or create a new one to begin chatting.
          </div>
        )}
      </section>
    </div>
  )
}
