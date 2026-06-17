import ChatPanel from './ChatPanel';

export default {
  title: 'ChatPanel',
  component: ChatPanel,
};

export const Default = { args: { open: true, chats: [], draftMessage: "", onToggle: () => {}, onDraftChange: () => {}, onSend: () => {} } };
