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

## Failure behavior

The server leaves the existing catalog untouched when the remote request or transaction fails. Error details are written to `catalog_meta.last_error`.



