import { lazy, Suspense, ComponentProps } from 'react';

const LazyGameRoom = lazy(() => import('./GameRoom'));

const GameRoom = (props: ComponentProps<typeof LazyGameRoom>) => (
  <Suspense fallback={null}>
    <LazyGameRoom {...props} />
  </Suspense>
);

export default GameRoom;
