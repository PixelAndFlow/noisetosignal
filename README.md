# noisetosignal

**Cycle 1: NoiseToSignal**

I didn't set out to build a YouTube tool. I set out to understand what it takes to ship something real — from a blank repository to a live, working product that solves a problem I actually have.

The foundation was a YouTube replica built from scratch: homepage feed, video search, player, navigation, a bookmark system. Not a tutorial clone — a deliberate re-engineering of a familiar product to understand how it actually works under the hood. React on the frontend, Node.js and Express on the backend, PostgreSQL for persistence, deployed to Render with a CI/CD pipeline tied to GitHub.

Once the replica was solid, I added the feature YouTube itself won't build: a creator and timeframe filter. YouTube's algorithm is designed to maximize the platform's engagement, not yours. NoiseToSignal flips that — you choose exactly which creators appear in your feed, and exactly how recent the content needs to be. No recommendations, no trending, no noise. Pure signal.

The build required integrating Google OAuth, the YouTube Data API v3, and a zero-quota RSS-first fetching strategy so the app could stay responsive without burning through API rate limits. Every video that surfaces in a user's feed is sourced from RSS when possible — the API only steps in when RSS isn't sufficient, which keeps the daily quota well within the 10,000-unit free tier even at scale.

The most technically demanding part of this cycle had nothing to do with features. It came from testing against real data. When I connected my own YouTube account — with over 2,000 subscriptions — the app capped out at 987 channels synced and refused to go further. Three separate fix attempts were made based on assumptions about where the ceiling was. All three failed.

The investigation that actually worked was methodical: I added per-iteration logging directly inside the API pagination loop, captured every single page request in sequence, and read the raw output line by line. The evidence was unambiguous — the YouTube API itself was stopping at page 20 and not returning a continuation token, regardless of what the code did. The 987 ceiling wasn't a bug. It was YouTube's API silently capping how many subscriptions a single access token can paginate through, and no amount of code change on my side could fix what the platform isn't providing.

That finding — and the discipline of not accepting "it looks fixed" as evidence — shaped how I now think about debugging, testing, and the gap between what an external API promises and what it actually delivers in production.

NoiseToSignal is live. It imports your real YouTube subscriptions, lets you filter by creator and timeframe, surfaces videos via RSS, and plays them through YouTube's IFrame Player API with full keyboard shortcut support. The architecture was designed from the start to scale: a shared video cache keyed by channel rather than by user, a PostgreSQL analytics event log, tiered subscription sync that respects rate limits, and a settings system that persists across every device you sign in from.

What I built this cycle wasn't just a feature — it was a disciplined approach to the entire software development lifecycle: requirements, architecture decisions, deployment, real-world data testing, and honest documentation of what worked and what didn't.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for what's shipped, in progress, and planned.
