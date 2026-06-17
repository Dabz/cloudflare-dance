import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RoomControls from './RoomControls';

describe('<RoomControls />', () => {
  test('should mount', () => {
    render(<RoomControls onDance={() => {}} onOpenCharacter={() => {}} onOpenMenu={() => {}} />);

    const roomControls = screen.getByTestId('RoomControls');

    expect(roomControls).toBeInTheDocument();
  });
});
