import { lazy, Suspense, ComponentProps } from 'react';

const LazyGameMenu = lazy(() => import('./GameMenu'));

const GameMenu = (props: ComponentProps<typeof LazyGameMenu>) => (
  <Suspense fallback={null}>
    <LazyGameMenu {...props} />
  </Suspense>
);

export default GameMenu;
