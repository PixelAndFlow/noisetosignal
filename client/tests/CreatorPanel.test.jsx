import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreatorPanel from '../src/components/CreatorPanel';

function makeSubs(count, selectedIds = []) {
  return Array.from({ length: count }, (_, i) => ({
    channel_id: `UC_${i}`,
    channel_name: `Channel ${i}`,
    channel_avatar_url: null,
    selected: selectedIds.includes(`UC_${i}`),
  }));
}

function renderPanel(overrides = {}) {
  const props = {
    subscriptions: makeSubs(5, ['UC_0', 'UC_1']),
    onToggle: vi.fn(),
    onBulkToggle: vi.fn(),
    onDeselctAll: vi.fn(),
    onSync: vi.fn(),
    lastSyncedAt: null,
    syncing: false,
    bulkProgress: null,
    confirmBulkActions: true,
    ...overrides,
  };
  const utils = render(<CreatorPanel {...props} />);
  return { ...utils, props };
}

describe('CreatorPanel: counts', () => {
  it('shows the real total and selected counts derived from props, never a hardcoded number', () => {
    renderPanel({ subscriptions: makeSubs(7, ['UC_0', 'UC_1', 'UC_2']) });
    expect(screen.getByText('7 subscribed')).toBeInTheDocument();
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('hides the selected badge entirely when nothing is selected', () => {
    renderPanel({ subscriptions: makeSubs(4, []) });
    expect(screen.getByText('4 subscribed')).toBeInTheDocument();
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });
});

describe('CreatorPanel: search and view toggle', () => {
  it('search filters the list by channel name', async () => {
    const user = userEvent.setup();
    renderPanel({ subscriptions: makeSubs(12, []) });

    await user.type(screen.getByPlaceholderText('Search creators...'), 'Channel 1');

    // "Channel 1" matches Channel 1, 10, 11 (substring match)
    expect(screen.getByText('Channel 1')).toBeInTheDocument();
    expect(screen.getByText('Channel 10')).toBeInTheDocument();
    expect(screen.getByText('Channel 11')).toBeInTheDocument();
    expect(screen.queryByText('Channel 2')).not.toBeInTheDocument();
  });

  it('"Selected" view shows only selected creators; "All" restores the full list', async () => {
    const user = userEvent.setup();
    renderPanel({ subscriptions: makeSubs(5, ['UC_0', 'UC_2']) });

    await user.click(screen.getByRole('button', { name: 'Selected' }));
    expect(screen.getByText('Channel 0')).toBeInTheDocument();
    expect(screen.getByText('Channel 2')).toBeInTheDocument();
    expect(screen.queryByText('Channel 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Channel 3')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Channel 1')).toBeInTheDocument();
    expect(screen.getByText('Channel 3')).toBeInTheDocument();
  });
});

describe('CreatorPanel: single creator select/deselect', () => {
  it('selecting an unselected creator calls onToggle immediately, no confirmation', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ subscriptions: makeSubs(3, []) });

    await user.click(screen.getByText('Channel 1').closest('button'));

    expect(props.onToggle).toHaveBeenCalledWith('UC_1', true);
    expect(screen.queryByText(/will remove all of their videos/)).not.toBeInTheDocument();
  });

  it('deselecting an already-selected creator opens a confirmation naming that real creator, and does nothing until confirmed', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ subscriptions: makeSubs(3, ['UC_1']) });

    await user.click(screen.getByText('Channel 1').closest('button'));

    expect(props.onToggle).not.toHaveBeenCalled();
    const dialog = screen.getByText(/will remove all of their videos/).closest('.confirm-dialog');
    expect(dialog).toHaveTextContent('Channel 1');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onToggle).not.toHaveBeenCalled();
    expect(screen.queryByText(/will remove all of their videos/)).not.toBeInTheDocument();
  });

  it('confirming the single-deselect dialog calls onToggle with selected=false', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ subscriptions: makeSubs(3, ['UC_1']) });

    await user.click(screen.getByText('Channel 1').closest('button'));
    await user.click(screen.getByRole('button', { name: 'Deselect' }));

    expect(props.onToggle).toHaveBeenCalledWith('UC_1', false);
    expect(screen.queryByText(/will remove all of their videos/)).not.toBeInTheDocument();
  });
});

describe('CreatorPanel: bulk actions (regression coverage for the hardcoded-999 bug)', () => {
  it('"Select all" with confirmBulkActions shows the real live count, not a hardcoded number', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ subscriptions: makeSubs(7, []), confirmBulkActions: true });

    await user.click(screen.getByRole('button', { name: 'Select all' }));

    // The dialog is rendered via createPortal directly onto document.body,
    // outside the render() container, so it must be queried from document.
    const dialog = document.querySelector('.confirm-dialog');
    expect(dialog).toHaveTextContent('7');
    expect(dialog).not.toHaveTextContent('999');

    await user.click(dialog.querySelector('.btn-primary'));
    expect(props.onBulkToggle).toHaveBeenCalledWith(
      ['UC_0', 'UC_1', 'UC_2', 'UC_3', 'UC_4', 'UC_5', 'UC_6'],
      true
    );
  });

  it('"Deselect all" (nuclear path) shows the real total count and calls onDeselctAll, not onBulkToggle', async () => {
    const allSelected = makeSubs(6, ['UC_0', 'UC_1', 'UC_2', 'UC_3', 'UC_4', 'UC_5']);
    const user = userEvent.setup();
    const { props } = renderPanel({ subscriptions: allSelected, confirmBulkActions: true });

    await user.click(screen.getByRole('button', { name: 'Deselect all' }));

    const dialog = document.querySelector('.confirm-dialog');
    expect(dialog).toHaveTextContent('6');
    expect(dialog).not.toHaveTextContent('999');

    await user.click(dialog.querySelector('.btn-danger'));

    expect(props.onDeselctAll).toHaveBeenCalledTimes(1);
    expect(props.onBulkToggle).not.toHaveBeenCalled();
  });

  it('skips the confirmation dialog entirely when confirmBulkActions is off', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ subscriptions: makeSubs(4, []), confirmBulkActions: false });

    await user.click(screen.getByRole('button', { name: 'Select all' }));

    expect(props.onBulkToggle).toHaveBeenCalledWith(['UC_0', 'UC_1', 'UC_2', 'UC_3'], true);
    expect(screen.queryByText('Select all 4 creators?')).not.toBeInTheDocument();
  });
});

describe('CreatorPanel: jump-to-selected arrows', () => {
  it('disables both arrows when nothing is selected', () => {
    renderPanel({ subscriptions: makeSubs(5, []) });
    expect(screen.getByTitle('Jump to previous selected creator')).toBeDisabled();
    expect(screen.getByTitle('Jump to next selected creator')).toBeDisabled();
  });

  it('enables both arrows when at least one creator is selected', () => {
    renderPanel({ subscriptions: makeSubs(5, ['UC_2']) });
    expect(screen.getByTitle('Jump to previous selected creator')).not.toBeDisabled();
    expect(screen.getByTitle('Jump to next selected creator')).not.toBeDisabled();
  });
});
