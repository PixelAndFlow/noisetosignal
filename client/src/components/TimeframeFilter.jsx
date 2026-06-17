import './TimeframeFilter.css';

const TIMEFRAMES = [
  { value: 'last_hour', label: 'Last hour' },
  { value: 'last_8_hours', label: 'Last 8 hours' },
  { value: 'last_24_hours', label: 'Last 24 hours' },
  { value: 'last_3_days', label: 'Last 3 days' },
  { value: 'last_7_days', label: 'Last week' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90_days', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
];

export default function TimeframeFilter({ value, onChange }) {
  return (
    <div className="timeframe-filter">
      {TIMEFRAMES.map(tf => (
        <button
          key={tf.value}
          className={`timeframe-btn ${value === tf.value ? 'active' : ''}`}
          onClick={() => onChange(tf.value)}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}
