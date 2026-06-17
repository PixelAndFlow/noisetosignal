import { Link } from 'react-router-dom';
import './PrivacyPage.css';

export default function PrivacyPage() {
  return (
    <div className="privacy-page">
      <div className="privacy-content">
        <Link to="/" className="back-link">← Back</Link>
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated: June 2026</p>

        <section>
          <h2>Overview</h2>
          <p>
            NoiseToSignal is a web application that uses your YouTube subscription list to create
            a filtered video feed. We use the YouTube Data API v3 and Google OAuth to access your data.
            This policy explains what we collect, why, and how we protect it.
          </p>
        </section>

        <section>
          <h2>Data we collect</h2>
          <ul>
            <li>Your Google account ID, email address, display name, and profile picture</li>
            <li>Your YouTube subscription list (channel names and IDs)</li>
            <li>Your in-app preferences (selected creators, timeframe filter, settings)</li>
            <li>Watch history within NoiseToSignal (which videos you've opened, capped at 500 entries per user)</li>
            <li>Anonymized usage events (which features you use, mode switches, filter changes)</li>
          </ul>
        </section>

        <section>
          <h2>YouTube API data</h2>
          <p>
            NoiseToSignal uses the{' '}
            <a href="https://developers.google.com/youtube/v3" target="_blank" rel="noopener noreferrer">
              YouTube Data API v3
            </a>{' '}
            with the <code>youtube.readonly</code> scope. This means we can read (but never write to)
            your YouTube subscription list and fetch publicly available video metadata.
          </p>
          <p>
            All YouTube API data is stored only as long as necessary and refreshed at least every 30 days
            in compliance with YouTube API Terms of Service. You can delete your data at any time from Settings.
          </p>
          <p>
            YouTube's terms apply to all content accessed through the API.{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
              YouTube Terms of Service
            </a>{' · '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Google Privacy Policy
            </a>
          </p>
        </section>

        <section>
          <h2>How we use your data</h2>
          <ul>
            <li>To display your subscription list inside NoiseToSignal</li>
            <li>To remember your creator selections and filter preferences across devices</li>
            <li>To track which videos you've watched (so we can show the watched indicator)</li>
            <li>To improve the product through aggregated, anonymized usage analytics</li>
          </ul>
          <p>We do not sell your data. We do not share your data with third parties except Google (for OAuth authentication).</p>
        </section>

        <section>
          <h2>Aggregated subscription data</h2>
          <p>
            NoiseToSignal caches video metadata in a shared pool to reduce YouTube API usage. This means
            video data from public YouTube channels may be visible within the app regardless of whether
            you are subscribed. Your personal subscription list is never shared with other users.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            Your OAuth access token is stored server-side only, encrypted with AES-256-GCM. It is never
            sent to your browser or stored in localStorage. Sessions use short-lived HttpOnly cookies.
          </p>
        </section>

        <section>
          <h2>Advertising</h2>
          <p>
            NoiseToSignal does not currently serve advertising. If advertising is added in the future,
            this policy will be updated and you will be notified. Any ads will appear only in
            NoiseToSignal's own UI — never injected into YouTube content or the YouTube iframe.
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <ul>
            <li><strong>Delete your data:</strong> Go to Settings → Delete my account. All data is deleted within 30 days.</li>
            <li><strong>Disconnect YouTube:</strong> Go to Settings → Disconnect YouTube to revoke our access to your Google account.</li>
            <li><strong>You can also revoke access</strong> at any time via{' '}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                Google's permissions page
              </a>.
            </li>
          </ul>
        </section>

        <section>
          <h2>Contact</h2>
          <p>Questions about this policy? Contact us at the email address associated with the Google Cloud project.</p>
        </section>
      </div>
    </div>
  );
}
