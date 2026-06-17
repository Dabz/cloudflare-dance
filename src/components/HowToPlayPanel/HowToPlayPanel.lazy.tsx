import { lazy, Suspense, ComponentProps } from 'react';

const LazyHowToPlayPanel = lazy(() => import('./HowToPlayPanel'));

const HowToPlayPanel = (props: ComponentProps<typeof LazyHowToPlayPanel>) => (
  <Suspense fallback={null}>
    <LazyHowToPlayPanel {...props} />
  </Suspense>
);

export default HowToPlayPanel;
