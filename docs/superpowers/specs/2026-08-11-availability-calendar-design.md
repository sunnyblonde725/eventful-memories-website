# Availability Calendar Widget — Design

## Purpose

Add a read-only calendar widget to the booking page (`book.html`) that shows customers which dates are available, unavailable, or a public event — driven by Sunny's existing "Eventful Memories Bookings" Google Calendar. This is one of two sub-projects under the "calendar integration" umbrella; the other (Square-payment-triggers-auto-recolor webhook) is a separate, later design.

## Scope

**In scope:**
- New Netlify function that reads the calendar and returns per-day availability state
- New front-end calendar widget on `book.html`
- Wiring the widget's click behavior into the existing booking form

**Out of scope (separate project):**
- Automatically recoloring a booking's calendar event from Banana (pending) to Tomato (confirmed) when a Square deposit is paid. For now, Sunny recolors that manually.

## Color Rules

Sunny marks days on her calendar using event color. The widget derives one of three customer-facing states per day:

| Calendar event color | Meaning to Sunny | Customer sees |
|---|---|---|
| *(no event)* | — | Available |
| Banana | Pending booking (created automatically by `send-booking.js`) | Unavailable |
| Tomato | Confirmed booking | Unavailable |
| Graphite | Manual black-out day | Unavailable |
| Blueberry | Public event (e.g. farmers market) | Public event |

**Multiple events on the same day:** if any event that day is Banana, Tomato, or Graphite, the day is Unavailable — a real block always overrides a public-event note, even if a Blueberry event also exists that day.

Customers never see event titles, times, or which specific unavailable-reason applies — only the derived state.

## Backend: `netlify/functions/availability.js`

New function, same pattern as the existing `catalog.js` and `send-booking.js`.

- **Input:** query param `start` (ISO date, e.g. `2026-09-01`)
- **Behavior:** fetches events from the "Eventful Memories Bookings" calendar for a 3-month window starting at `start`, using the existing Google service account credentials (`GOOGLE_SERVICE_ACCOUNT_KEY`, already configured)
- **Output:** JSON object mapping ISO date strings to one of `"available"`, `"unavailable"`, `"public"`:
  ```json
  { "2026-09-14": "unavailable", "2026-09-15": "public" }
  ```
  Dates with no event are omitted (front-end treats any missing date as available).
- **Privacy:** the response never includes event titles, descriptions, or times — only the three-value state per day.
- **Errors:** on any failure (Calendar API error, missing credentials), return a 200 with an `{"error": true}` flag rather than a 500, so the front-end can degrade gracefully rather than treating it as a hard failure.

## Frontend: calendar widget on `book.html`

- Sits above the quote builder, styled to match the site's existing black/gold/cream palette (see mockup, approved in brainstorming — plain colored day cells, no strikethrough; a small legend below the grid explains Available/Unavailable/Public event/Selected)
- Month grid with `‹`/`›` navigation
  - `‹` disabled when viewing the current month (no browsing into the past)
  - `›` disabled 12 months out from today
  - Within the current month, days before today are rendered the same as Unavailable (grayed, not clickable) regardless of their actual calendar state — customers can't select a date that's already passed
- **Fetch strategy:** on load, fetch a 3-month window starting at the current month in one request and cache it client-side. Navigating within that window is instant (no refetch). Navigating past the cached window triggers a new 3-month fetch from the new starting point.
- **Click behavior:**
  - Available day → fills the `Event Date` field in the booking form below
  - Public event day → shows a generic message: "We're out at a public event this day — come see us!" (not the specific event name/location)
  - Unavailable day → no action (not clickable)
- **Failure fallback:** if the availability fetch fails or returns `{"error": true}`, show a small inline note ("Couldn't load availability — go ahead and enter your date below, we'll confirm directly") and otherwise leave the booking form fully functional. The widget is additive; it must never block booking.

## Testing (manual — no automated test suite in this repo)

1. Create one real test event of each color (Banana, Tomato, Graphite, Blueberry) on the "Eventful Memories Bookings" calendar; confirm the widget reflects each correctly.
2. Create a day with two events — one Graphite + one Blueberry — confirm it renders Unavailable, not Public.
3. Confirm clicking an Available day fills the Event Date field; clicking Public shows the generic note; clicking Unavailable does nothing.
4. Confirm `‹` is disabled on the current month and `›` is disabled 12 months out.
5. Temporarily break the function (e.g. bad env var) and confirm the form still works end-to-end without the widget.
6. Check the widget on a phone-width screen.

**Why:** Give customers self-serve visibility into open dates without exposing Sunny's private calendar details, while keeping the existing booking flow fully functional if the widget fails.
**How to apply:** This is the spec for the read-only availability widget only. The Square-webhook auto-recolor project should get its own spec when Sunny is ready to build it.
