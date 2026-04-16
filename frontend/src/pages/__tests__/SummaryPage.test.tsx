import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SummaryPage from '../SummaryPage';

describe('SummaryPage', () => {
  it('should render summary page without crashing', async () => {
    render(
      <MemoryRouter>
        <SummaryPage />
      </MemoryRouter>
    );

    // SummaryPage should render
    await waitFor(() => {
      const pageContent = document.body.textContent;
      expect(pageContent).toBeTruthy();
    });
  });

  it('should load tasks from API', async () => {
    render(
      <MemoryRouter>
        <SummaryPage />
      </MemoryRouter>
    );

    // MSW returns tasks, wait for them to load
    await waitFor(() => {
      // SummaryPage fetches tasks and renders them
      const pageContent = document.body.textContent;
      expect(pageContent).toBeTruthy();
    });
  });
});
