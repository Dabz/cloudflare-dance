import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import GameRoom from './GameRoom';

describe('<GameRoom />', () => {
  test('should mount', () => {
    render(<GameRoom />);

    const gameRoom = screen.getByTestId('GameRoom');

    expect(gameRoom).toBeInTheDocument();
  });
});
