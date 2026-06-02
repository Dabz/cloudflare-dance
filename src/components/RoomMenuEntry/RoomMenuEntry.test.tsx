import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RoomMenuEntry from './RoomMenuEntry';

describe('<RoomMenuEntry />', () => {
  test('should mount', () => {
    render(<RoomMenuEntry />);

    const roomMenuEntry = screen.getByTestId('RoomMenuEntry');

    expect(roomMenuEntry).toBeInTheDocument();
  });
});
