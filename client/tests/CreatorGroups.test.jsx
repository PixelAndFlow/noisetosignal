import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreatorGroups from '../src/components/CreatorGroups';

function renderGroups(overrides = {}) {
  const props = {
    groups: [
      { id: 1, name: 'Tech News', member_count: 3 },
      { id: 2, name: 'Gaming', member_count: 5 },
    ],
    selectedChannelIds: ['UC_a', 'UC_b'],
    groupSelectBehavior: 'ask',
    onSaveGroup: vi.fn().mockResolvedValue(undefined),
    onDeleteGroup: vi.fn(),
    onApplyGroup: vi.fn(),
    onSetGroupSelectBehavior: vi.fn(),
    onUpdateGroup: vi.fn(),
    ...overrides,
  };
  const utils = render(<CreatorGroups {...props} />);
  return { ...utils, props };
}

describe('CreatorGroups: rendering', () => {
  it('renders real group names and member counts, not placeholders', () => {
    renderGroups();
    expect(screen.getByText('Tech News')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Gaming')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});

describe('CreatorGroups: save current selection', () => {
  it('saving a new group calls onSaveGroup with the entered name and the real selected channel ids', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ selectedChannelIds: ['UC_x', 'UC_y', 'UC_z'] });

    await user.click(screen.getByRole('button', { name: '+ Save selection' }));
    await user.type(screen.getByPlaceholderText('Group name (e.g. Tech News)'), 'My Group');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onSaveGroup).toHaveBeenCalledWith('My Group', ['UC_x', 'UC_y', 'UC_z']);
  });

  it('disables "+ Save selection" when nothing is currently selected', () => {
    renderGroups({ selectedChannelIds: [] });
    expect(screen.getByRole('button', { name: '+ Save selection' })).toBeDisabled();
  });

  it('a 409-style rejection from onSaveGroup surfaces an inline error, not a crash', async () => {
    const user = userEvent.setup();
    const onSaveGroup = vi.fn().mockRejectedValue(new Error('A group with that name already exists'));
    renderGroups({ onSaveGroup });

    await user.click(screen.getByRole('button', { name: '+ Save selection' }));
    await user.type(screen.getByPlaceholderText('Group name (e.g. Tech News)'), 'Tech News');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('A group with that name already exists')).toBeInTheDocument();
  });
});

describe('CreatorGroups: applying with behavior=ask', () => {
  it('clicking a group opens the replace/add modal and does not call onApplyGroup yet', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ groupSelectBehavior: 'ask' });

    await user.click(screen.getByText('Tech News').closest('button'));

    expect(props.onApplyGroup).not.toHaveBeenCalled();
    const dialog = document.querySelector('.confirm-dialog');
    expect(dialog).toHaveTextContent('Tech News');
  });

  it('clicking "Replace current selection" calls onApplyGroup with mode=replace', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ groupSelectBehavior: 'ask' });

    await user.click(screen.getByText('Tech News').closest('button'));
    const dialog = document.querySelector('.confirm-dialog');
    await user.click(screen.getByText('Replace current selection'));

    expect(props.onApplyGroup).toHaveBeenCalledWith(1, 'replace');
    expect(props.onSetGroupSelectBehavior).not.toHaveBeenCalled();
    expect(dialog).not.toBeInTheDocument();
  });

  it('clicking "Add to current selection" calls onApplyGroup with mode=add', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ groupSelectBehavior: 'ask' });

    await user.click(screen.getByText('Gaming').closest('button'));
    await user.click(screen.getByText('Add to current selection'));

    expect(props.onApplyGroup).toHaveBeenCalledWith(2, 'add');
  });

  it('checking "Remember my choice" before clicking Replace also calls onSetGroupSelectBehavior', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ groupSelectBehavior: 'ask' });

    await user.click(screen.getByText('Tech News').closest('button'));
    await user.click(screen.getByLabelText(/Remember my choice/));
    await user.click(screen.getByText('Replace current selection'));

    expect(props.onApplyGroup).toHaveBeenCalledWith(1, 'replace');
    expect(props.onSetGroupSelectBehavior).toHaveBeenCalledWith('replace');
  });

  it('leaving "Remember my choice" unchecked does not call onSetGroupSelectBehavior', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ groupSelectBehavior: 'ask' });

    await user.click(screen.getByText('Gaming').closest('button'));
    await user.click(screen.getByText('Add to current selection'));

    expect(props.onSetGroupSelectBehavior).not.toHaveBeenCalled();
  });
});

describe('CreatorGroups: applying with a remembered behavior', () => {
  it('behavior=replace applies immediately with no modal', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ groupSelectBehavior: 'replace' });

    await user.click(screen.getByText('Tech News').closest('button'));

    expect(props.onApplyGroup).toHaveBeenCalledWith(1, 'replace');
    expect(document.querySelector('.confirm-dialog')).not.toBeInTheDocument();
  });

  it('behavior=add applies immediately with no modal', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ groupSelectBehavior: 'add' });

    await user.click(screen.getByText('Gaming').closest('button'));

    expect(props.onApplyGroup).toHaveBeenCalledWith(2, 'add');
    expect(document.querySelector('.confirm-dialog')).not.toBeInTheDocument();
  });
});

describe('CreatorGroups: update to current selection', () => {
  it('opens a confirmation naming the real group and the real selected count, does not call onUpdateGroup yet', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ selectedChannelIds: ['UC_x', 'UC_y'] });

    await user.click(screen.getByLabelText('Update group Tech News to current selection'));

    expect(props.onUpdateGroup).not.toHaveBeenCalled();
    const dialog = document.querySelector('.confirm-dialog');
    expect(dialog).toHaveTextContent('Tech News');
    expect(dialog).toHaveTextContent('2 selected creators');
  });

  it('confirming calls onUpdateGroup with the group id and the real current selection', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups({ selectedChannelIds: ['UC_x', 'UC_y', 'UC_z'] });

    await user.click(screen.getByLabelText('Update group Gaming to current selection'));
    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(props.onUpdateGroup).toHaveBeenCalledWith(2, ['UC_x', 'UC_y', 'UC_z']);
  });

  it('cancel leaves onUpdateGroup uncalled', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups();

    await user.click(screen.getByLabelText('Update group Tech News to current selection'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onUpdateGroup).not.toHaveBeenCalled();
    expect(document.querySelector('.confirm-dialog')).not.toBeInTheDocument();
  });

  it('disables the update control when nothing is currently selected', () => {
    renderGroups({ selectedChannelIds: [] });
    expect(screen.getByLabelText('Update group Tech News to current selection')).toBeDisabled();
  });
});

describe('CreatorGroups: delete', () => {
  it('delete opens a confirmation naming the real group, cancel leaves onDeleteGroup uncalled', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups();

    await user.click(screen.getByLabelText('Delete group Tech News'));
    const dialog = document.querySelector('.confirm-dialog');
    expect(dialog).toHaveTextContent('Tech News');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onDeleteGroup).not.toHaveBeenCalled();
    expect(document.querySelector('.confirm-dialog')).not.toBeInTheDocument();
  });

  it('confirming delete calls onDeleteGroup with the group id', async () => {
    const user = userEvent.setup();
    const { props } = renderGroups();

    await user.click(screen.getByLabelText('Delete group Gaming'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(props.onDeleteGroup).toHaveBeenCalledWith(2);
  });
});
