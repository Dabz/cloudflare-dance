import { lazy, Suspense, ComponentProps } from 'react';

const LazyBanner = lazy(() => import('./Banner'));

const Banner = (props: ComponentProps<typeof LazyBanner>) => (
  <Suspense fallback={null}>
    <LazyBanner {...props} />
  </Suspense>
);

export default Banner;
