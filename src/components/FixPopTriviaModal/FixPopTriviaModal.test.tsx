import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FixPopTriviaModal from './FixPopTriviaModal';

describe('<FixPopTriviaModal />', () => {
  test('should mount', () => {
    render(<FixPopTriviaModal fixPopState={{ name: "fix-pop", enabled: true, active: true, questionIds: [], scores: {}, playerNames: {}, answeredPlayers: {} }} answers={{}} onAnswer={() => {}} onSubmit={() => {}} onClose={() => {}} />);

    const fixPopTriviaModal = screen.getByTestId('FixPopTriviaModal');

    expect(fixPopTriviaModal).toBeInTheDocument();
  });
});
