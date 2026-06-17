import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Modal from './Modal';

describe('<Modal />', () => {
  test('should mount', () => {
    render(<Modal title="Test modal" titleId="test-modal" closeLabel="Close test modal" onClose={() => {}}>Body</Modal>);

    const modal = screen.getByTestId('Modal');

    expect(modal).toBeInTheDocument();
  });
});
