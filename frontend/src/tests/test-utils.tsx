import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

interface RenderWithRouterOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
}

export function renderWithRouter(ui: React.ReactElement, options: RenderWithRouterOptions = {}) {
  const { route = '/', ...renderOptions } = options;
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>,
    renderOptions,
  );
}
