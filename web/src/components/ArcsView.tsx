import { useEffect, useMemo, useRef } from 'react'

import { useAppStore } from '@/stores/app-store'
import type { Arc, Msg, Nym } from '@/types'

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
  const { setActiveArc, createArc } = useAppStore((state) => state.actions)
  const msgsEndRef = useRef<HTMLDivElement | null>(null)

  const arcList = useMemo(() => {
    return Object.values(arcs).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
  }, [arcs])

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
    })
    setActiveArc(newArcId)
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
              <h2>{activeArc.title}</h2>
              <span className={styles.metadata}>
                {summariseParticipants(activeArc, nyms)}
              </span>
            </div>
            <div className={styles.arcBody}>
              <div className={styles.msgs}>
                {activeMsgs.map((msg) => (
                  <article key={msg.id} className={styles.msgCard}>
                    <header className={styles.msgHeader}>
                      <span className={styles.msgAuthor}>
                        {getAuthorName(msg, nyms)}
                      </span>
                      <span className={styles.msgTimestamp}>{formatTimestamp(msg.createdAt)}</span>
                    </header>
                    <p>{msg.content}</p>
                    <span className={styles.msgStatus}>{msg.status}</span>
                  </article>
                ))}
                {activeMsgs.length === 0 ? (
                  <div className={styles.emptyState}>No messages yet. Start the arc!</div>
                ) : null}
                <div ref={msgsEndRef} />
              </div>
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
