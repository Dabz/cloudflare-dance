import { lazy, Suspense, ComponentProps } from 'react';

const LazyRoomControls = lazy(() => import('./RoomControls'));

const RoomControls = (props: ComponentProps<typeof LazyRoomControls>) => (
  <Suspense fallback={null}>
    <LazyRoomControls {...props} />
  </Suspense>
);

export default RoomControls;
