import { Link } from 'react-router-dom';
import './LandingPage.css';

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="landing-logo">
          <span className="logo-mark">NTS</span>
          <span className="logo-text">NoiseToSignal</span>
        </span>
        <Link to="/privacy" className="landing-privacy-link">Privacy Policy</Link>
      </header>

      <main className="landing-hero">
        <div className="landing-badge">Signal mode · YouTube mode</div>
        <h1 className="landing-headline">
          Your subscriptions,<br />
          filtered by <em>you</em>.
        </h1>
        <p className="landing-sub">
          NoiseToSignal shows only videos from creators you choose, in a timeframe you set.
          No algorithm. No noise. Pure signal — or YouTube when you want discovery.
        </p>

        <a href="/api/auth/google" className="btn btn-primary landing-cta">
          Sign in with Google
        </a>

        <p className="landing-legal">
          By signing in you agree to our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
          NoiseToSignal uses your YouTube subscription list (read-only) to build your feed.
          <br />
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
            YouTube Terms of Service
          </a>
          {' · '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google Privacy Policy
          </a>
        </p>
      </main>

      <footer className="landing-footer">
        <span>© 2026 NoiseToSignal</span>
        <Link to="/privacy">Privacy</Link>
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube ToS</a>
      </footer>
    </div>
  );
}
