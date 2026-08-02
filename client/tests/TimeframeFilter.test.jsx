import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TimeframeFilter from '../src/components/TimeframeFilter';

const ALL_TIMEFRAMES = [
  ['Last hour', 'last_hour'],
  ['Last 8 hours', 'last_8_hours'],
  ['Last 24 hours', 'last_24_hours'],
  ['Last 3 days', 'last_3_days'],
  ['Last week', 'last_7_days'],
  ['Last month', 'last_month'],
  ['Last 3 months', 'last_90_days'],
  ['Last 6 months', 'last_6_months'],
];

describe('TimeframeFilter', () => {
  it('renders all 8 timeframe options with the correct labels', () => {
    render(<TimeframeFilter value="last_3_days" onChange={() => {}} />);
    for (const [label] of ALL_TIMEFRAMES) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('marks only the button matching the current value as active', () => {
    render(<TimeframeFilter value="last_7_days" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Last week' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Last month' })).not.toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Last hour' })).not.toHaveClass('active');
  });

  it.each(ALL_TIMEFRAMES)('clicking "%s" calls onChange with "%s"', async (label, value) => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimeframeFilter value="last_3_days" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: label }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(value);
  });
});
