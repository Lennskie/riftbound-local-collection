# Data Model


## Tables

- `card_definitions`: normalized card identity and type line.
- `card_printings`: catalog records, set/collector information, variant flags, and remote image URL.
- `containers`: physical premade decks, custom decks, and bulk boxes.
- `inventory`: quantity by container + printing + finish + `main`/`sideboard` zone. Existing inventory is migrated to `main`.
- `premade_blueprints`: locked expected definition quantities for premade and custom decks.
- `catalog_meta`: sync timestamps, counts, and errors.


## Definition grouping

Deck containers (`custom` and `premade`) enforce limits by normalized card definition, so alternate printings and normal/foil finishes count together: at most 40 non-rune/non-legend/non-battlefield cards in the main deck, 12 runes total (up to 6 of each rune), 1 legend, 3 battlefields, 10 sideboard cards, and 3 copies of each other non-legend definition across the deck and sideboard. Bulk containers are not subject to these limits. Rune, legend, and battlefield cards are kept in the main zone and do not count toward the 40-card or 10-card limits.

