import { lazy, Suspense, ComponentProps } from 'react';

const LazyRoomBanners = lazy(() => import('./RoomBanners'));

const RoomBanners = (props: ComponentProps<typeof LazyRoomBanners>) => (
  <Suspense fallback={null}>
    <LazyRoomBanners {...props} />
  </Suspense>
);

export default RoomBanners;
