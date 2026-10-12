# Catalog Sync

The provider abstraction is implemented in `server/catalog.js`.

## Rifthunt bulk request

The configured URL defaults to `https://api.rifthunt.com/bulk/cards` and is requested directly:

```text
GET https://api.rifthunt.com/bulk/cards
```


## Field compatibility

The adapter accepts the exact specification names and the names present in the supplied fixture. Examples:

| Concept | Accepted fields |
|---|---|
| Printing ID | `code`, `riftboundId`, `printing_id`, `id` |
| TCGPlayer ID | `tcgplayer_id`, `tcgId` |
| Name | `name`, `card_name`, `cleanName` |
| Set | `set_code`, `set`, `setCode` |
| Set name | `set_name`, `setName`, `setLabel` |
| Collector number | `collector_number`, `collectorNum`, `num` |
| Card classification stored as `type_line` | `type_line`, `typeLine`, `card_type`, `type` |
| Artwork | `image_url`, `art_url`, `imgUrl`, `img` |
| Alternate art | `is_alternate_art`, `alt` |
| Overnumbered | `is_overnumbered`, `over` |
| Signature | `is_signature`, `sig` |

The live Rifthunt bulk response uses `type` for the card classification, with values such as `Rune`, `Legend`, and `Battlefield`; it does not provide a `type_line` field. The adapter maps that canonical `type` value into the database's `card_definitions.type_line` column, while accepting the explicit aliases above. Deck rules and deck UI classification depend on this mapping. The response also uses `riftboundId`/`imgUrl`/`tcgId`-style fields for other concepts.

## Definition names and duplicate printing IDs

A trailing parenthetical is treated as a printing variant: for example, `Fury Rune (Alternate Art)` keeps that full name in `card_printings.card_name`, while the associated `card_definitions.card_name` is the original-cased base name `Fury Rune`. Parentheticals that are not trailing, such as `Recruit (271) // Buff`, remain part of the base name.

When two feed records share a printing ID, the record with a trailing variant label receives `<printing-id>-<slugged-variant-label>` (for example, `opp-017-024-metal`), and the unlabelled record keeps the base ID. This preserves both physical printings for catalogue display and scanner artwork verification. Existing inventory rows are not automatically migrated: before this rule, a duplicate ID could have referred to whichever printing was synced last, so confirm affected inventory against its artwork after syncing.

## Scanner catalogue version

After a successful catalog transaction, sync builds the compact scanner snapshot and hashes its stable JSON representation with SHA-1. The resulting `scanner_hash` and the next integer `scanner_version` are stored together in `catalog_meta` only when the content changes. Therefore repeating an identical sync does not invalidate phone caches merely because sync timestamps changed. The snapshot includes active definitions and printings only; the `/api/scanner/version` endpoint reads only the version metadata, while `/api/scanner/index` returns the version with the full snapshot.

## Failure behavior

The server leaves the existing catalog untouched when the remote request or transaction fails. Error details are written to `catalog_meta.last_error`.

