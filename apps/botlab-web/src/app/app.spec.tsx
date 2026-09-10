import { render } from '@testing-library/react';

import App from './app';

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<App />);
    expect(baseElement).toBeTruthy();
  });

  it('should show the BotLab project screen', () => {
    const { getByText } = render(<App />);
    expect(getByText(/Laboratorio visual para robots programables/i)).toBeTruthy();
  });
});
