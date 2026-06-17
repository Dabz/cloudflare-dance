import { lazy, Suspense, ComponentProps } from 'react';

const LazyCharacterPickerModal = lazy(() => import('./CharacterPickerModal'));

const CharacterPickerModal = (props: ComponentProps<typeof LazyCharacterPickerModal>) => (
  <Suspense fallback={null}>
    <LazyCharacterPickerModal {...props} />
  </Suspense>
);

export default CharacterPickerModal;
