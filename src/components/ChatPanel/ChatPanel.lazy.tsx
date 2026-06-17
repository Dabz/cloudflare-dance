import { lazy, Suspense, ComponentProps } from 'react';

const LazyChatPanel = lazy(() => import('./ChatPanel'));

const ChatPanel = (props: ComponentProps<typeof LazyChatPanel>) => (
  <Suspense fallback={null}>
    <LazyChatPanel {...props} />
  </Suspense>
);

export default ChatPanel;
