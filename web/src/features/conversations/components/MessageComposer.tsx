import { useMemo, useState } from 'react'
import type { FormEventHandler, KeyboardEventHandler } from 'react'

import { useAppStore } from '@/stores/app-store'

import styles from './MessageComposer.module.css'

type MessageComposerProps = {
  conversationId: string
}

export const MessageComposer = ({ conversationId }: MessageComposerProps) => {
  const [content, setContent] = useState('')
  const conversation = useAppStore((state) => state.conversations[conversationId])
  const appendMessage = useAppStore((state) => state.actions.appendMessage)
  const queueRequest = useAppStore((state) => state.actions.queueRequest)

  const trimmedContent = useMemo(() => content.trim(), [content])
  const isDisabled = !conversation || trimmedContent.length === 0

  const handleSubmit = () => {
    if (isDisabled) {
      return
    }

    const authorId = 'user'

    const messageId = appendMessage(conversationId, {
      authorId,
      authorRole: 'user',
      content: trimmedContent,
      status: 'complete',
    })

    if (messageId && conversation) {
      queueRequest({
        conversationId,
        authorId,
        messageId,
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
