import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TvDisplayModal from './TvDisplayModal';

describe('<TvDisplayModal />', () => {
  test('should mount', () => {
    render(<TvDisplayModal draftDisplayUrl="" streams={[]} onClose={() => {}} onSubmit={() => {}} onDraftChange={() => {}} onShareVideo={() => {}} />);

    const tvDisplayModal = screen.getByTestId('TvDisplayModal');

    expect(tvDisplayModal).toBeInTheDocument();
  });
});
