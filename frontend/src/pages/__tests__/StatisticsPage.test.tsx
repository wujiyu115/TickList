import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import StatisticsPage from '../StatisticsPage';
import { renderWithRouter } from '../../tests/test-utils';

describe('StatisticsPage', () => {
  it('should render statistics overview after loading', async () => {
    renderWithRouter(<StatisticsPage />);

    // Wait for data to load (MSW returns mock data)
    await waitFor(() => {
      expect(screen.getByText('总任务数')).toBeInTheDocument();
    });

    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(screen.getByText('待处理')).toBeInTheDocument();
    expect(screen.getByText('完成率')).toBeInTheDocument();
  });

  it('should display statistics values from API', async () => {
    renderWithRouter(<StatisticsPage />);

    await waitFor(() => {
      // MSW returns total_tasks: 10
      expect(screen.getByText('10')).toBeInTheDocument();
    });
    // completed_tasks: 5
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
