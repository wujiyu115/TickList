import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import CountdownPage from '../CountdownPage';
import { renderWithRouter } from '../../tests/test-utils';

describe('CountdownPage', () => {
  it('should render countdown page with title and create button', async () => {
    renderWithRouter(<CountdownPage />);

    expect(screen.getByText('倒数日')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建/ })).toBeInTheDocument();
  });

  it('should load and display countdown list from API', async () => {
    renderWithRouter(<CountdownPage />);

    // MSW returns a countdown with title '新年倒计时'
    await waitFor(() => {
      expect(screen.getByText('新年倒计时')).toBeInTheDocument();
    });
  });
});
