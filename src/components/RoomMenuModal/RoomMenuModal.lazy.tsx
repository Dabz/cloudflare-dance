import { lazy, Suspense, ComponentProps } from 'react';

const LazyRoomMenuModal = lazy(() => import('./RoomMenuModal'));

const RoomMenuModal = (props: ComponentProps<typeof LazyRoomMenuModal>) => (
  <Suspense fallback={null}>
    <LazyRoomMenuModal {...props} />
  </Suspense>
);

export default RoomMenuModal;
