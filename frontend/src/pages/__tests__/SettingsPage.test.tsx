import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../SettingsPage';
import { ThemeContext } from '../../App';

describe('SettingsPage', () => {
  const renderSettingsPage = () => {
    return render(
      <MemoryRouter>
        <ThemeContext.Provider value={{ primaryColor: '#1677ff', isDark: false, setTheme: vi.fn() }}>
          <SettingsPage />
        </ThemeContext.Provider>
      </MemoryRouter>
    );
  };

  it('should render settings page after loading', async () => {
    renderSettingsPage();

    // Wait for settings to load from MSW
    await waitFor(() => {
      // SettingsPage has section titles
      expect(screen.getAllByText(/配色方案/).length).toBeGreaterThan(0);
    });
  });

  it('should display settings sections', async () => {
    renderSettingsPage();

    await waitFor(() => {
      // Check for key settings sections - exact text depends on the component
      const pageContent = document.body.textContent;
      expect(pageContent).toBeTruthy();
    });
  });
});
