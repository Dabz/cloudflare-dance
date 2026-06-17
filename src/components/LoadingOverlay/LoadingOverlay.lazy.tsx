import { lazy, Suspense, ComponentProps } from 'react';

const LazyLoadingOverlay = lazy(() => import('./LoadingOverlay'));

const LoadingOverlay = (props: ComponentProps<typeof LazyLoadingOverlay>) => (
  <Suspense fallback={null}>
    <LazyLoadingOverlay {...props} />
  </Suspense>
);

export default LoadingOverlay;
