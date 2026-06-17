import { lazy, Suspense, ComponentProps } from 'react';

const LazyTvDisplayModal = lazy(() => import('./TvDisplayModal'));

const TvDisplayModal = (props: ComponentProps<typeof LazyTvDisplayModal>) => (
  <Suspense fallback={null}>
    <LazyTvDisplayModal {...props} />
  </Suspense>
);

export default TvDisplayModal;
