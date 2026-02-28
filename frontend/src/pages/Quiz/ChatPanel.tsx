import { FormEvent, useState } from 'react'
import { Button, Input } from '../../components/ui'
import type { Team } from '../../types/room.types'
import type { ChatMessageDto } from '../../hooks/useGames'

interface ChatPanelProps {
  messages: ChatMessageDto[]
  onSend: (body: string) => void
  team: Team | null
}

const ChatPanel = ({ messages, onSend, team }: ChatPanelProps) => {
  const [body, setBody] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!team) return
    const value = body.trim()
    if (!value) return
    onSend(value)
    setBody('')
  }

  return (
    <aside className="pageCard quizChatCard">
      <h3>Чат команды {team ?? '—'}</h3>
      <div className="quizChatHistory" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className="quizChatMessage">
            <strong>{message.author}</strong>
            <p>{message.body}</p>
          </div>
        ))}
      </div>
      <form className="quizChatForm" onSubmit={handleSubmit}>
        <Input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Напишите сообщение" maxLength={500} disabled={!team} />
        <Button type="submit" disabled={!team}>Отправить</Button>
      </form>
    </aside>
  )
}

export default ChatPanel
