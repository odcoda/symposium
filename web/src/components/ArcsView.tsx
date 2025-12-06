import { useEffect, useMemo, useRef, useState } from 'react'

import { useOpenRouterClient } from '@/hooks/useOpenRouterClient'
import { executeChatCompletion, fetchGenerationWithRetry } from '@/lib/openrouter/executor'
import { useAppStore } from '@/stores/app-store'
import type {
  Arc,
  Msg,
  Nym,
  OpenRouterChatCompletionRequest,
  OpenRouterChatMsg,
} from '@/types'

import { MsgComposer } from './MsgComposer'
import styles from './ArcsView.module.css'

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

const sumTokens = (...values: Array<number | undefined>) =>
  values.reduce((total, value) => (typeof value === 'number' ? total + value : total), 0)

const getTokenCount = (generation?: Msg['generation']) => {
  if (!generation) {
    return null
  }

  const nativeCount = sumTokens(
    generation.native_tokens_prompt,
    generation.native_tokens_completion,
    generation.native_tokens_reasoning,
    generation.native_tokens_completion_images,
  )
  if (nativeCount > 0) {
    return Math.round(nativeCount)
  }

  const fallbackCount = sumTokens(generation.tokens_prompt, generation.tokens_completion)
  return fallbackCount > 0 ? Math.round(fallbackCount) : null
}

const getGenerationCost = (generation?: Msg['generation']) => {
  if (!generation) {
    return null
  }

  if (typeof generation.total_cost === 'number') {
    return generation.total_cost
  }

  if (typeof generation.usage === 'number') {
    return generation.usage
  }

  if (typeof generation.upstream_inference_cost === 'number') {
    return generation.upstream_inference_cost
  }

  return null
}

const formatCost = (cost: number) => {
  if (cost >= 1) {
    return cost.toFixed(2)
  }
  if (cost >= 0.01) {
    return cost.toFixed(3)
  }
  return cost.toFixed(4)
}

const getAuthorName = (
  msg: Msg,
  nyms: Record<string, Nym>,
): string => {
  if (msg.authorRole === 'user') {
    return 'You'
  }

  if (msg.authorRole === 'system') {
    return 'System'
  }

  if (msg.authorRole === 'assistant') {
    const nym = nyms[msg.authorId]
    return nym?.name ?? 'Nym'
  }

  return 'Unknown'
}

const summariseParticipants = (arc: Arc, nyms: Record<string, Nym>) => {
  const names = arc.activeNymIds
    .map((id) => nyms[id]?.name)
    .filter(Boolean)
  return names.length ? names.join(', ') : 'No nyms yet'
}

export const ArcsView = () => {
  const arcs = useAppStore((state) => state.arcs)
  const msgs = useAppStore((state) => state.msgs)
  const nyms = useAppStore((state) => state.nyms)
  const activeArcId = useAppStore((state) => state.activeArcId)
  const { setActiveArc, createArc, createMsg, updateMsg, deleteMsg } = useAppStore(
    (state) => state.actions,
  )
  const msgsEndRef = useRef<HTMLDivElement | null>(null)
  const openRouterClient = useOpenRouterClient()
  const [selectedNymId, setSelectedNymId] = useState('')
  const [pendingDirectRequests, setPendingDirectRequests] = useState(0)
  const [requestError, setRequestError] = useState<string | null>(null)

  const arcList = useMemo(() => {
    return Object.values(arcs).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
  }, [arcs])

  const nymList = useMemo(() => Object.values(nyms), [nyms])

  const activeArc = activeArcId
    ? arcs[activeArcId]
    : arcList[0]

  const activeMsgs = useMemo(() => {
    if (!activeArc) {
      return []
    }

    return activeArc.msgIds
      .map((id) => msgs[id])
      .filter((msg): msg is Msg => Boolean(msg))
  }, [activeArc, msgs])

  const activeArcCost = useMemo(() => {
    if (!activeArc) {
      return null
    }
    const total = activeMsgs.reduce((sum, msg) => {
      const cost = getGenerationCost(msg.generation)
      return typeof cost === 'number' ? sum + cost : sum
    }, 0)
    return total > 0 ? total : 0
  }, [activeArc, activeMsgs])

  useEffect(() => {
    setSelectedNymId((current) => {
      if (current && nyms[current]) {
        return current
      }

      const fallback =
        activeArc?.activeNymIds.find((id) => nyms[id]) ??
        nymList[0]?.id ??
        ''
      return fallback
    })
  }, [activeArc, nyms, nymList])

  useEffect(() => {
    if (!msgsEndRef.current) {
      return
    }

    msgsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeArc?.id, activeMsgs.length])

  const handleCreateArc = () => {
    const newArcId = createArc({
      title: 'New Arc',
      participantIds: ['user'],
      activeNymIds: [],
    })
    setActiveArc(newArcId)
  }

  const handleDirectResponseRequest = async () => {
    if (!activeArc || !selectedNymId) {
      setRequestError('Select an arc and nym to request a response.')
      return
    }

    const nym = nyms[selectedNymId]
    if (!nym) {
      setRequestError('Selected nym no longer exists.')
      return
    }

    setPendingDirectRequests((count) => count + 1)
    setRequestError(null)

    const promptMsgs: OpenRouterChatMsg[] = activeMsgs.map((msg) => {
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
        { role: 'system', content: nym.prompt || 'You are a helpful collaborator.' },
        ...promptMsgs,
      ],
      temperature: nym.temperature,
      metadata: {
        arcId: activeArc.id,
        nymId: nym.id,
      },
    }

    const placeholderMsgId = createMsg({
      arcId: activeArc.id,
      authorId: nym.id,
      authorRole: 'assistant',
      content: '',
      status: 'streaming',
    })

    let assembledContent = ''
    try {
      const completion = await executeChatCompletion({
        client: openRouterClient,
        request: requestBody,
        onContentChunk: (chunk) => {
          assembledContent += chunk
          updateMsg(placeholderMsgId, {
            content: assembledContent,
            updatedAt: new Date().toISOString(),
            statusDetails: undefined,
          })
        },
      })

      const finalContent = (assembledContent || '').trim()
      updateMsg(placeholderMsgId, {
        content: finalContent.length ? finalContent : '(No response)',
        status: 'complete',
        updatedAt: new Date().toISOString(),
        statusDetails: undefined,
      })

      if (completion.response?.id && openRouterClient) {
        const responseId = completion.response.id
        void (async () => {
          const generation = await fetchGenerationWithRetry(openRouterClient, responseId)
          if (generation) {
            updateMsg(placeholderMsgId, {
              generation,
              updatedAt: new Date().toISOString(),
            })
          }
        })()
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Direct request failed'
      setRequestError(message)
      updateMsg(placeholderMsgId, {
        status: 'error',
        statusDetails: message,
        updatedAt: new Date().toISOString(),
      })
    } finally {
      setPendingDirectRequests((count) => Math.max(0, count - 1))
    }
  }

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Arcs</h2>
          <button type="button" className={styles.newArcButton} onClick={handleCreateArc}>
            New
          </button>
        </div>
        <ul className={styles.arcList}>
          {arcList.map((arc) => {
            const isActive = arc.id === activeArc?.id
            const primaryMsgId = arc.msgIds.at(-1)
            const primaryMsg = primaryMsgId ? msgs[primaryMsgId] : undefined
            const preview = primaryMsg?.content.slice(0, 80) ?? 'No messages yet'

            return (
              <li key={arc.id}>
                <button
                  type="button"
                  className={[
                    styles.arcButton,
                    isActive ? styles.arcButtonActive : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setActiveArc(arc.id)}
                >
                  <span className={styles.arcTitle}>{arc.title}</span>
                  <span className={styles.arcMeta}>
                    {formatTimestamp(arc.updatedAt)} · {preview}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>
      <section className={styles.workspace}>
        {activeArc ? (
          <>
            <div className={styles.arcHeader}>
              <div className={styles.arcHeaderDetails}>
                <h2>{activeArc.title}</h2>
                <span className={styles.metadata}>
                  {summariseParticipants(activeArc, nyms)}
                </span>
              </div>
              {activeArcCost !== null ? (
                <div className={styles.arcCostBadge}>
                  Total cost · ${formatCost(activeArcCost)}
                </div>
              ) : null}
            </div>
            <div className={styles.arcBody}>
              <div className={styles.msgs}>
                {activeMsgs.map((msg) => {
                  const tokenCount = getTokenCount(msg.generation)
                  const costValue = getGenerationCost(msg.generation)
                  const showGenerationMeta =
                    tokenCount !== null || costValue !== null

                  return (
                    <article key={msg.id} className={styles.msgCard}>
                      <header className={styles.msgHeader}>
                        <div className={styles.msgHeaderMeta}>
                          <span className={styles.msgAuthor}>
                            {getAuthorName(msg, nyms)}
                          </span>
                          <span className={styles.msgTimestamp}>{formatTimestamp(msg.createdAt)}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.msgDeleteButton}
                        onClick={() => deleteMsg(msg.id)}
                        aria-label="Delete message"
                      >
                        Delete
                      </button>
                      </header>
                      <p>{msg.content}</p>
                      {showGenerationMeta ? (
                        <div className={styles.msgGenerationMeta}>
                          {tokenCount !== null ? `${tokenCount} tokens` : null}
                          {tokenCount !== null && costValue !== null ? ' · ' : null}
                          {costValue !== null ? `$${formatCost(costValue)}` : null}
                        </div>
                      ) : null}
                      {msg.status === 'error' && msg.statusDetails ? (
                        <div className={styles.msgStatusError}>{msg.statusDetails}</div>
                      ) : null}
                      <span className={styles.msgStatus}>{msg.status}</span>
                    </article>
                  )
                })}
                {activeMsgs.length === 0 ? (
                  <div className={styles.emptyState}>No messages yet. Start the arc!</div>
                ) : null}
                <div ref={msgsEndRef} />
              </div>
              <div className={styles.directRequestControls}>
                <label htmlFor="direct-nym-select" className={styles.directRequestLabel}>
                  Request direct response
                </label>
                <select
                  id="direct-nym-select"
                  className={styles.directRequestSelect}
                  value={selectedNymId}
                  onChange={(event) => setSelectedNymId(event.target.value)}
                  disabled={nymList.length === 0}
                >
                  {nymList.map((nym) => (
                    <option key={nym.id} value={nym.id}>
                      {nym.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.directRequestButton}
                  onClick={handleDirectResponseRequest}
                  disabled={
                    !selectedNymId || !activeArc || nymList.length === 0
                  }
                >
                  {pendingDirectRequests > 0
                    ? `Requesting (${pendingDirectRequests})…`
                    : 'Send request'}
                </button>
              </div>
              {requestError ? (
                <div className={styles.directRequestError}>{requestError}</div>
              ) : null}
              <MsgComposer arcId={activeArc.id} />
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            Select an arc or create a new one to begin chatting.
          </div>
        )}
      </section>
    </div>
  )
}
