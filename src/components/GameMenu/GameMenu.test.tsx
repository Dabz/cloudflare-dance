import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import GameMenu from './GameMenu';

describe('<GameMenu />', () => {
  test('should mount', () => {
    render(<GameMenu />);

    const gameMenu = screen.getByTestId('GameMenu');

    expect(gameMenu).toBeInTheDocument();
  });
});
