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

## Planned tests (not yet written)

Backlog for closing the remaining frontend coverage gap, in rough priority
order. Listed here so they're tracked as part of the suite even before
they're built — pick one and follow the "Adding a new test" pattern below.

### Test infra to build first (a few of the tests below depend on this)

- **A `renderWithProviders()` helper** — everything below except
  `LandingPage` and `VideoCard` reads from `AuthContext`/`ModeContext`/
  `ThemeContext` via `useAuth`/`useMode`/`useTheme`, and several use
  `react-router-dom` hooks (`useNavigate`, `useParams`, `useSearchParams`).
  Wrap `render()` with `MemoryRouter` + the three real providers (or
  lightweight mock providers exposing just `{ user, mode, theme, ... }`
  plus `vi.fn()` stand-ins for `setMode`/`setTheme`/`logout`) so each test
  file doesn't reinvent this.
- **A `global.fetch` mock helper** — `CreatorPanel`/`TimeframeFilter` take
  everything as props and never call `fetch`; `HomePage`, `WatchPage`,
  `SettingsPage`, and the three contexts all call `fetch` directly. Needs
  a small helper (e.g. `vi.stubGlobal('fetch', ...)` with per-URL canned
  responses) so tests can assert on which endpoint was called with what
  body, not just on the resulting UI state.

### `VideoCard.test.jsx`
- Renders the real thumbnail `<img>` when `thumbnail_url` is present;
  renders the placeholder div when it's null
- Shows the watched checkmark badge only when `video.watched` is true
- Shows the duration badge only when `video.duration` is present
- Channel avatar: real `<img>` vs. the first-initial placeholder fallback
  (including the `'?'` fallback when `channel_name` is missing)
- `timeAgo()` boundary cases: minutes, hours, days, months, years (this is
  pure-ish logic worth unit testing directly with fixed `Date` values)
- Data-source tag (`RSS`/`API`) shown only when `showDataSource` is true
  AND `video.data_source` is present — hidden if either is false/missing
- Card links to `/watch/{video_id}`

### `TimeframeFilter` / `CreatorPanel` — already covered, no gap

### `KeyboardShortcutsOverlay.test.jsx`
- Renders all 6 shortcut rows with the correct key badges and action text
- Clicking the overlay background calls `onClose`; clicking inside the
  dialog itself does NOT (tests the `stopPropagation` guard)
- Clicking the ✕ button calls `onClose`
- Pressing `Escape` calls `onClose`; other keys do not

### `Sidebar.test.jsx`
- Toggling calls `onExpandChange` with the new expanded state, and swaps
  the toggle icon (`☰` ↔ `←`)
- Labels are visible only when expanded; collapsed state falls back to a
  `title` attribute per item instead
- The nav item matching the current route (via `MemoryRouter initialEntries`)
  gets the `active` class; others don't

### `NavBar.test.jsx` (needs the provider helper above + `MemoryRouter`)
- Mode toggle: `active` class matches current mode; clicking Signal/YouTube
  calls `setMode` with the right value
- Search form is visible only in Signal mode; replaced by the
  "Search available in Signal mode" message in YouTube mode
- Submitting a non-empty search in Signal mode navigates to `/?q=...`
  (assert via a `MemoryRouter` history spy); submitting empty/whitespace
  does not navigate
- Theme icon reflects current theme; clicking cycles
  system → dark → light → system in that exact order
- User avatar: real image vs. first-initial fallback
- Clicking the avatar opens the user menu; clicking outside the menu
  (mousedown on `document.body`) closes it; clicking "Sign out" calls
  `logout`

### `KeyboardShortcutsOverlay` — see above (already listed)

### `LandingPage.test.jsx`
- Renders the "Sign in with Google" CTA linking to `/api/auth/google`
- Both Privacy Policy links (nav + footer) point to `/privacy`
- External ToS/Google Privacy links carry `target="_blank"` and
  `rel="noopener noreferrer"` — worth asserting explicitly since dropping
  `noopener` on an external link is a real (if minor) security regression

### `SettingsPage.test.jsx` (needs the provider helper + fetch mock)
- Each control initializes from `user.settings` via context, not a
  hardcoded default
- Changing the sync-frequency `<select>` calls
  `PUT /api/settings/subscription_sync_frequency` with the new value
- Clicking "Sync now": shows the syncing spinner, then a result message
  (`"N added, M removed."` or `"No changes found."` or the failure
  message) that clears after 5s (use fake timers)
- Toggling "Confirm bulk actions" / "Show data source" calls
  `saveSetting` with `'on'`/`'off'` matching the checkbox state
- Theme buttons: `active` class matches current theme; clicking each
  calls `setTheme`
- "Disconnect YouTube" and "Delete account" both follow the same
  two-step confirm pattern: initial button → inline "Are you sure?" /
  "This can't be undone." confirm row → Cancel restores the original
  button with no fetch call → confirming calls the right endpoint
  (`POST /api/auth/revoke` / `DELETE /api/auth/account`) and navigates
  to `/`

### `WatchPage.test.jsx` (needs `MemoryRouter` with a route param, fetch mock, and mocked `navigator.clipboard`/`navigator.share`)
- Shows a loading spinner before the fetch resolves; shows "Video not
  found" when the API returns null/404
- Marks the video watched (`POST /api/videos/:id/watched`) once on
  successful load
- Like/view count pills render only when the corresponding `*_display`
  field is present
- Description: truncates to 200 chars with a "Show more" toggle when
  longer; toggling flips between "Show more"/"Show less"
- Comments: "Show comments" fetches once and caches (clicking again
  doesn't refetch); renders the comment list, the "disabled" message, or
  "No comments yet" depending on the API response shape
- Share button: calls `navigator.share` when available; otherwise falls
  back to `navigator.clipboard.writeText` and shows "✓ Copied" for 2s
  (fake timers)
- Keyboard shortcuts: `?`/`/` toggles the shortcuts overlay; Space/K,
  arrows, M, and F each `postMessage` the correct YouTube IFrame API
  command shape to the player iframe's `contentWindow`
- Subscribed badge shows "✓ Subscribed" vs. a "Subscribe on YouTube ↗"
  link based on `video.is_subscribed`

### `HomePage.test.jsx` (the biggest one — needs the provider helper + fetch mock; consider splitting into multiple files by concern)
- On mount, fetches `/api/subscriptions` and passes the result into
  `CreatorPanel`
- With zero creators selected: shows the "Select creators to get
  started" empty state and never issues a feed request with channel IDs
- With creators selected: fetches `/api/videos/feed` with the current
  `timeframe`/`sort`/`offset` as query params, renders one `VideoCard`
  per returned video
- Changing the timeframe: refetches the feed AND persists it via
  `PUT /api/settings/default_recency_window`
- "Load more" only appears when `has_more` is true; clicking it appends
  the next page rather than replacing the current list
- Sync banner: success shows `"N added, M removed"` (or "No changes
  found"), auto-dismisses after 5s; failure shows the server's error
  message and does not auto-dismiss the same way (matches actual code)
- Bulk-progress banner appears during `onBulkToggle`/`onDeselctAll` and
  disappears when the operation completes
- Switching to YouTube mode renders the iframe; simulating its `onError`
  shows the "Open YouTube" fallback instead of a blank page
- The `?q=` search param client-side-filters the already-loaded videos by
  title/channel name, and the "Showing X of Y" count reflects the
  filtered count, not the unfiltered total

### Context tests (`AuthContext`, `ModeContext`, `ThemeContext`)
Lower priority than the page/component tests above since they're mostly
exercised indirectly through those, but worth their own file eventually:
- `AuthContext`: the 401 → refresh → retry flow actually re-fetches `/me`
  after a successful refresh, and gives up (sets `user: null`) if the
  refresh itself fails; `logout()` clears the user
- `ModeContext`: defaults to `'signal'`, picks up
  `user.settings.default_viewing_mode` once the user loads, and only
  POSTs the `mode_switched` event when a user is present (not for a
  logged-out visitor)
- `ThemeContext`: defaults to `'system'`; setting a theme both updates
  `document.documentElement`'s `data-theme` attribute correctly (present
  for light/dark, removed for system) and persists it via
  `PUT /api/settings/dark_mode`

## Adding a new test

Same pattern as the two existing files: render the component with plain
fake props (a mock function via `vi.fn()` for every callback), interact
with `userEvent`, and assert on what the user would actually see — text,
disabled state, class names — not on internal component state.
