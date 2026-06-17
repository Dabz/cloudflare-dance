import { lazy, Suspense, ComponentProps } from 'react';

const LazyModal = lazy(() => import('./Modal'));

const Modal = (props: ComponentProps<typeof LazyModal>) => (
  <Suspense fallback={null}>
    <LazyModal {...props} />
  </Suspense>
);

export default Modal;
