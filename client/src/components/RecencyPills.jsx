import './RecencyPills.css';

const OPTIONS = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export default function RecencyPills({ value, onChange }) {
  return (
    <div className="recency-pills" role="group" aria-label="Recency window">
      {OPTIONS.map(({ label, days }) => (
        <button
          key={days}
          type="button"
          className={`recency-pill ${value === days ? 'active' : ''}`}
          onClick={() => onChange(days)}
          aria-pressed={value === days}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
