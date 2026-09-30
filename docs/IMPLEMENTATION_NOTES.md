# Implementation Notes

The supplied specification was implemented as a working baseline rather than a mock UI. The JSON fixture was inspected only to make the provider mapper compatible with the actual response shape; it is not included in the repository.

The API and schema cover the requested routes. The UI includes catalog browsing, container management, box detail, QR label generation, location-aware search, and QR scanning fallback messaging.

The restoration screen exposes calculated shortfalls and a direct move workflow for suggested source copies. This represents the current source-selection UI: users can restore a locked deck by moving the available copies from another container into the deck, without introducing a separate source-picker component to the rest of the app.

Premade blueprints remain routed through the Riftatlas import workflow rather than a separate direct blueprint editor. The backend endpoint remains available for API use, but the application UI intentionally does not duplicate it because the Riftatlas import path is the user-facing workflow for premade decks.
