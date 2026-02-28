import { FormEvent, useState } from 'react'
import type { ChatMessageDto } from '../../hooks/useGames'

interface ChatPanelProps {
  messages: ChatMessageDto[]
  onSend: (body: string) => void
}

const ChatPanel = ({ messages, onSend }: ChatPanelProps) => {
  const [body, setBody] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const value = body.trim()
    if (!value) return
    onSend(value)
    setBody('')
  }

  return (
    <aside className="pageCard quizChatCard">
      <h3>Чат комнаты</h3>
      <div className="quizChatHistory" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className="quizChatMessage">
            <strong>{message.author}</strong>
            <p>{message.body}</p>
          </div>
        ))}
      </div>
      <form className="quizChatForm" onSubmit={handleSubmit}>
        <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Напишите сообщение" maxLength={500} />
        <button className="roomButton" type="submit">Отправить</button>
      </form>
    </aside>
  )
}

export default ChatPanel
