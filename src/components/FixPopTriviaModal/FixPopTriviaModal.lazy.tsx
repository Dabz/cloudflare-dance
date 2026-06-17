import { lazy, Suspense, ComponentProps } from 'react';

const LazyFixPopTriviaModal = lazy(() => import('./FixPopTriviaModal'));

const FixPopTriviaModal = (props: ComponentProps<typeof LazyFixPopTriviaModal>) => (
  <Suspense fallback={null}>
    <LazyFixPopTriviaModal {...props} />
  </Suspense>
);

export default FixPopTriviaModal;
