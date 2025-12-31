import type {
  Nym,
  Msg,
  OpenRouterChatMsg
} from '@/types'

export const makePrompt = (
  nym: Nym,
  nyms: Record<string, Nym>,
  msgs: Msg[]
): OpenRouterChatMsg[] => {
  const promptMsgs: OpenRouterChatMsg[] = msgs.map((msg) => {
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
  const messages: OpenRouterChatMsg[] = [
    {
      role: 'system',
      content: nym.prompt
    },
    ...promptMsgs
  ]
  console.log("[prompts] prompt: ", messages)
  return messages
}