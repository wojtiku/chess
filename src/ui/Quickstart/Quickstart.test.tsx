import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QUICKSTART } from '../../teaching/quickstart';
import Quickstart from './Quickstart';

const setup = (over: Partial<Parameters<typeof Quickstart>[0]> = {}) => {
  const onFinished = vi.fn();
  const onCancel = vi.fn();
  render(<Quickstart onFinished={onFinished} onCancel={onCancel} {...over} />);
  return { onFinished, onCancel, user: userEvent.setup() };
};

describe('Quickstart', () => {
  it('states where the learner is', () => {
    setup();
    expect(screen.getByTestId('quickstart-progress')).toHaveTextContent(`Step 1 of ${QUICKSTART.length}`);
  });

  it('asks for one thing, and says why', () => {
    // Both the instruction and the purpose are ours and fixed. Nothing here is
    // model-written, so a learner is never shown a phrase the app cannot check.
    setup();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(QUICKSTART[0]!.instruction);
    expect(screen.getByText(QUICKSTART[0]!.purpose)).toBeInTheDocument();
  });

  it('offers no next button until there is an answer', () => {
    setup();
    expect(screen.queryByTestId('quickstart-next')).not.toBeInTheDocument();
  });

  it('shows progress as a list of steps', () => {
    const { container } = render(<Quickstart onFinished={vi.fn()} onCancel={vi.fn()} />);
    expect(container.querySelectorAll('.quickstart-dots li')).toHaveLength(QUICKSTART.length);
  });

  it('lets the learner cancel', async () => {
    const { onCancel, user } = setup();
    await user.click(screen.getByTestId('quickstart-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not claim a step is done before it is done', () => {
    const { container } = render(<Quickstart onFinished={vi.fn()} onCancel={vi.fn()} />);
    const done = container.querySelectorAll('.quickstart-dots li[data-done="true"]');
    expect(done).toHaveLength(0);
  });
});
