import { useEffect, useRef, type FC, type FormEvent } from "react";
import type { Chat } from "../../../worker/model/chat";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  open: boolean;
  chats: Chat[];
  draftMessage: string;
  onToggle: () => void;
  onDraftChange: (value: string) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
}

function parseChatContent(content: string): { content: string; playerNameColor?: string } {
  const match = content.match(/^\[name:(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})\]\s*/);
  if (!match) return { content };

  return { content: content.slice(match[0].length), playerNameColor: match[1] };
}

function getPlayerNameColor(playerName: string): string {
  let hash = 0;
  for (let index = 0; index < playerName.length; index++) hash = (hash * 31 + playerName.charCodeAt(index)) % 360;
  return `hsl(${hash} 92% 68%)`;
}

function parseInternalPlayerMessage(content: string): { before: string; playerName: string; after: string } | undefined {
  const match = content.match(/^Player (.+) (join|left) the room$/);
  if (!match) return undefined;
  return { before: "Player ", playerName: match[1], after: ` ${match[2]} the room` };
}

const ChatPanel: FC<ChatPanelProps> = ({ open, chats, draftMessage, onToggle, onDraftChange, onSend }) => {
  const chatListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight });
  }, [chats, open]);

  return (
    <section className={`${styles.ChatPanel} ${open ? styles.ChatPanelOpen : ""}`} data-testid="ChatPanel" aria-label="Room chat">
      <button type="button" className={styles.ChatToggle} aria-expanded={open} onClick={onToggle}>Chat</button>
      {open && (
        <div className={styles.ChatBody}>
          <div className={styles.ChatMessages} ref={chatListRef}>
            {chats.length === 0 && <p className={styles.ChatEmpty}>No messages</p>}
            {chats.map((chat) => {
              const parsedChat = parseChatContent(chat.content);
              const internalPlayerMessage = chat.isInternal ? parseInternalPlayerMessage(parsedChat.content) : undefined;
              return (
                <article className={`${styles.ChatMessage} ${chat.isInternal ? styles.ChatMessageInternal : ""}`} key={chat.id}>
                  {!chat.isInternal && chat.playerDisplayName && <span className={styles.ChatPlayerId} style={parsedChat.playerNameColor ? { color: parsedChat.playerNameColor } : undefined}>{chat.playerDisplayName}</span>}
                  <p>{internalPlayerMessage ? <>{internalPlayerMessage.before}<span className={styles.ChatInternalPlayerName} style={{ color: getPlayerNameColor(internalPlayerMessage.playerName) }}>{internalPlayerMessage.playerName}</span>{internalPlayerMessage.after}</> : parsedChat.content}</p>
                </article>
              );
            })}
          </div>
          <form className={styles.ChatForm} onSubmit={onSend}>
            <input aria-label="Chat message" maxLength={500} onChange={(event) => onDraftChange(event.target.value)} placeholder="Say something" type="text" value={draftMessage} />
            <button type="submit" disabled={!draftMessage.trim()}>Send</button>
          </form>
        </div>
      )}
    </section>
  );
};

export default ChatPanel;
