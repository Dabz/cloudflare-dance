import { lazy, Suspense, ComponentProps } from 'react';

const LazyRoomMenuEntry = lazy(() => import('./RoomMenuEntry'));

const RoomMenuEntry = (props: ComponentProps<typeof LazyRoomMenuEntry>) => (
  <Suspense fallback={null}>
    <LazyRoomMenuEntry {...props} />
  </Suspense>
);

export default RoomMenuEntry;
