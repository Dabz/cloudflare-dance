import { lazy, Suspense, ComponentProps } from 'react';

const LazyMobileJoystick = lazy(() => import('./MobileJoystick'));

const MobileJoystick = (props: ComponentProps<typeof LazyMobileJoystick>) => (
  <Suspense fallback={null}>
    <LazyMobileJoystick {...props} />
  </Suspense>
);

export default MobileJoystick;
