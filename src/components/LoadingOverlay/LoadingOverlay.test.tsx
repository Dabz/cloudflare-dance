import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import LoadingOverlay from './LoadingOverlay';

describe('<LoadingOverlay />', () => {
  test('should mount', () => {
    render(<LoadingOverlay progress={42} />);

    const loadingOverlay = screen.getByTestId('LoadingOverlay');

    expect(loadingOverlay).toBeInTheDocument();
  });
});
