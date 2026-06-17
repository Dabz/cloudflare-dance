import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CharacterPickerModal from './CharacterPickerModal';

describe('<CharacterPickerModal />', () => {
  test('should mount', () => {
    render(<CharacterPickerModal selectedCharacter="characterY" onSelect={() => {}} onClose={() => {}} />);

    const characterPickerModal = screen.getByTestId('CharacterPickerModal');

    expect(characterPickerModal).toBeInTheDocument();
  });
});
