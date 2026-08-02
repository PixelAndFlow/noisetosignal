# Frontend test suite

Vitest + React Testing Library, running in jsdom. No backend, no database,
no network calls — pure component rendering and interaction. This is
meant to be the fast feedback loop while iterating on frontend changes:
these run in well under a second.

## Running

```
npm test           # run once
npm run test:watch # re-run on file changes as you edit
```

## How it works

- `vitest.config.js` sets `environment: 'jsdom'` and loads
  `tests/setup.js` (imports `@testing-library/jest-dom` for matchers like
  `toBeInTheDocument()`, `toHaveClass()`, `toBeDisabled()`).
- Components are rendered directly with `@testing-library/react`'s
  `render()` and interacted with via `@testing-library/user-event`
  (real click/type events, not just DOM mutation).
- Components that use `createPortal` (e.g. `CreatorPanel`'s confirmation
  dialogs) render their portal content onto `document.body`, **outside**
  the container `render()` returns — query those with `document.querySelector(...)`
  or `screen.getBy...`, not `container.querySelector(...)`.
- Components that read from context (`AuthContext`, `ModeContext`,
  `ThemeContext`) will need to be wrapped in their provider when you write
  tests for them — neither existing test file needs this yet since
  `TimeframeFilter` and `CreatorPanel` take everything as props.

## What's covered so far

| File | Covers |
|---|---|
| `TimeframeFilter.test.jsx` | All 8 timeframe buttons render with correct labels, active state matches the current value, clicking each one calls `onChange` with the right value |
| `CreatorPanel.test.jsx` | Real (non-hardcoded) total/selected counts, search filtering, All/Selected view toggle, single deselect confirmation (shows the real creator name, does nothing until confirmed), bulk select/deselect confirmation (shows the real live count — direct regression coverage for the historical "hardcoded 999" bug), bulk actions skip confirmation when `confirmBulkActions` is off, jump-arrow disabled/enabled state |
| `build.test.js` | Runs a real `vite build` to a temp directory and asserts `dist/index.html` has `<title>NoiseToSignal</title>` — confirms the frontend actually builds, not just that components render in a test environment |

## What this doesn't cover yet

- **Pages** (`HomePage`, `WatchPage`, `SettingsPage`, `LandingPage`) — these
  pull in context providers, routing, and API calls, and don't have tests
  yet. `VideoCard`, `NavBar`, `Sidebar`, `KeyboardShortcutsOverlay` are
  also untested so far.
- **Real browser behavior** (actual YouTube iframe embedding, real OAuth
  redirect, real clipboard/keyboard shortcuts) — jsdom doesn't run a real
  browser engine. Those stay in `testing-plan-manual.md` in the docs repo,
  or can be checked with the Claude-in-Chrome browser tools on request.
- **Integration with the real backend** — these tests mock nothing from
  the server; they pass plain fake props/functions directly to components.
  End-to-end flows (click in the UI → real API call → real DB write) are
  covered on the backend side in `server/tests/`, not here.

## Adding a new test

Same pattern as the two existing files: render the component with plain
fake props (a mock function via `vi.fn()` for every callback), interact
with `userEvent`, and assert on what the user would actually see — text,
disabled state, class names — not on internal component state.
