import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RoomMenuModal from './RoomMenuModal';

describe('<RoomMenuModal />', () => {
  test('should mount', () => {
    render(<RoomMenuModal minigameEnabled={true} onClose={() => {}} onReset={() => {}} onMainMenu={() => {}} onStartDdos={() => {}} onStartFixPop={() => {}} onToggleDdos={() => {}} />);

    const roomMenuModal = screen.getByTestId('RoomMenuModal');

    expect(roomMenuModal).toBeInTheDocument();
  });
});
