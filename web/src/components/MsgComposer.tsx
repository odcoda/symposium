import { useMemo, useState } from 'react'
import type { FormEventHandler, KeyboardEventHandler } from 'react'

import { useAppStore } from '@/stores/app-store'

import styles from './MsgComposer.module.css'

type MsgComposerProps = {
  arcId: string
}

export const MsgComposer = ({ arcId }: MsgComposerProps) => {
  const [content, setContent] = useState('')
  const arc = useAppStore((state) => state.arcs[arcId])
  const appendMsg = useAppStore((state) => state.actions.appendMsg)
  const queueRequest = useAppStore((state) => state.actions.queueRequest)

  const trimmedContent = useMemo(() => content.trim(), [content])
  const isDisabled = !arc || trimmedContent.length === 0

  const handleSubmit = () => {
    if (isDisabled) {
      return
    }

    const authorId = 'user'

    const msgId = appendMsg(arcId, {
      authorId,
      authorRole: 'user',
      content: trimmedContent,
      status: 'complete',
    })

    if (msgId && arc) {
      queueRequest({
        arcId,
        authorId,
        msgId,
      })
    }

    setContent('')
  }

  const handleFormSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    handleSubmit()
  }

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className={styles.composer}>
      <div className={styles.composerHeader}>
        <span>Send a message</span>
        <span>{trimmedContent.length} characters</span>
      </div>
      <form className={styles.form} onSubmit={handleFormSubmit}>
        <textarea
          className={styles.textarea}
          placeholder="Share your thoughts with the group…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.actions}>
          <button type="submit" className={styles.sendButton} disabled={isDisabled}>
            Send
          </button>
          <span className={styles.helperText}>Press Enter to send • Shift + Enter for a new line</span>
        </div>
      </form>
    </div>
  )
}
