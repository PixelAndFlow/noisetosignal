const passport = require('passport');
require('../routes/auth'); // registers the 'google' strategy as a side effect

// Part 4, item 3 of testing-plan-claude-code.md: "a fresh login grants
// youtube.readonly scope." Cheap insurance against that scope ever being
// accidentally dropped from the strategy config — a real runtime check
// against the registered passport strategy, not a source-text guess.
// This does NOT cover the full live flow (real Google login completing,
// sync succeeding without a 403) — that requires a real Google account
// and is out of scope for automated/API testing, same as the rest of
// "real OAuth login" in server/tests/README.md's "what this doesn't
// cover" section.
describe('OAuth strategy configuration', () => {
  it('requests the youtube.readonly scope', () => {
    const strategy = passport._strategy('google');
    expect(strategy._scope).toContain('https://www.googleapis.com/auth/youtube.readonly');
  });

  it('requests profile and email too, so login itself still works', () => {
    const strategy = passport._strategy('google');
    expect(strategy._scope).toContain('profile');
    expect(strategy._scope).toContain('email');
  });
});
