# User Guide

## Dashboard

Use the dashboard to see containers, catalog status, last sync, and trigger a manual sync.

## Containers

Create a bulk box, custom deck, or premade deck. Open a container to inspect inventory and generate its QR label.

### Edit a container

On the **Containers** page, choose **Edit** next to the container you want to update. The app supports editing the existing container fields exposed by the backend: the container name and description.

### Import a Riftatlas decklist

Create a **Premade deck** container and open it. In **Import Riftatlas decklist**, paste the full Riftatlas text export, including its section headings (`Legend`, `Champion`, `MainDeck`, `Battlefields`, `Runes`, and `Sideboard`). Choose **Preview list** to check catalog matches and deck limits. When the preview is ready, choose **Replace contents and import** to load the list and lock its main-deck blueprint. The importer resolves card identities across printing variants; it will not change the container if a card name is missing or the list exceeds deck limits. Importing replaces the current inventory in that premade container.

### Delete a container

On the **Containers** page, choose **Delete container** below its entry. Confirm the prompt to permanently remove that container and all inventory tracked inside it. Move cards to another container first if you want to keep tracking their locations.

## Search

Use **Location Search** to look up card names or definition keys and see how many copies you own and which containers hold them. Results show the card's printing details and the total quantity across its inventory entries. Clicking a result opens the matching box directly when the card is held in one container, or prompts you to choose a destination box when it is split across multiple containers.

## Cards page scanner

On **Cards**, choose the destination container first, then tap the camera button beside the search field. The scanner checks that a container is selected and that the browser has a secure context before asking for camera permission. Phones require HTTPS with a certificate trusted by the device; see [Getting Started](GETTING_STARTED.md#enable-https-for-phone-camera-access).

Hold a card steady and in focus inside the guide. Automatic capture starts after the card edges and title area are detected as sharp and steady; **Scan now** is available as a manual fallback. For portrait cards, align the name banner in the highlighted band around the middle-left of the card, below its type bar and artwork. Use **Battlefield** for landscape cards. If the scanner cannot read a title, move or remove the card before holding it in the guide again.

The scanner shows its best definition match and the available printing artwork for visual verification. Swipe or use the arrows/dots to choose the exact printing; the caption includes set, collector number, rarity, variant, and printing ID. Choose **Normal** or **Foil**, the quantity, and (for deck containers) the zone. Runes, legends, battlefields, and all cards added to bulk boxes always use the main zone.

Choose **ADD** to add the selected printing. Server deck-limit or network errors leave the card and its selected printing on screen so you can retry. **RETRY** returns to the live camera without adding anything; **Done** closes the scanner. The camera stays on between cards, and the selected finish, quantity, zone, and orientation remain available during the scanner session.

## Transfers

On a deck container page, choose a destination and use **Move to destination** on a card row. To restore a locked deck, scan/open its QR page and use **Move N to deck** next to a matching copy found in another container. Transfers update both containers atomically and preserve the card's finish and source zone.

To set the expected list for a custom deck, use **Lock current deck** after adding its main-deck cards. Premade Riftatlas imports lock their main list automatically. The deck page then shows missing card definitions and the containers where matching copies are stored.

## QR labels

Open a container and choose **Generate 2" QR label**. The generated QR encodes the box URL. Print it at approximately 2 × 2 inches and attach it to the physical box.

## Mobile

If the browser supports camera APIs in its security context, use the in-app QR scanner. Otherwise scan the printed label with the phone's native camera and open the URL.
