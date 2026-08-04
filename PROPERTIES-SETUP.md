# Properties Section — Setup Notes

## What's real vs. placeholder
- **Listing data**: `properties-data.js` — mock data right now. Replace with your NWMLS IDX provider feed.
- **Map**: `PropertyMapSearch.dc.html` — isolated placeholder component. Pins use mock `mapX/mapY` percentages, not real coordinates.
- **Photos**: `<image-slot>` placeholders on every card and gallery — drop real MLS photos straight in, no code changes needed.
- **Forms** (Schedule a Tour, Request Info, Home Valuation, Save Search): currently save to browser localStorage only. Point these at your CRM.

## Connecting the live Northwest MLS IDX feed
1. Sign with an NWMLS-approved IDX vendor (e.g. IDX Broker, iHomefinder, Realtyna, Chime, kvCORE). NWMLS requires a signed IDX agreement plus vendor certification.
2. Filter the feed by Listing Agent ID (LAG): Jack Macdonald `136199`, Stephen Macdonald `65120` — add more team members in `properties-data.js` → `AGENTS`.
3. Replace the `LISTINGS` export in `properties-data.js` with data from that provider's feed/API, keeping the same field names (`price`, `beds`, `baths`, `sqft`, `status`, `openHouse`, etc.) so cards, filters, and detail pages need no changes.
4. Most IDX providers sync every 15–60 minutes — once connected, price/status/photo changes update automatically. No manual add/remove.

## Map provider
- `PropertyMapSearch.dc.html` is fully isolated on purpose — swap its placeholder pins for a real map (Google Maps, Mapbox, or your IDX vendor's embedded map).
- You'll need an API key (e.g. `GOOGLE_MAPS_API_KEY` or `MAPBOX_ACCESS_TOKEN`).
- "Draw your own search area" only works if your chosen IDX vendor's map widget supports it — check their docs.

## SEO / indexable property URLs
This is a single-page design (client-side view switching) — it does not have real, independently indexable URLs like `/properties/bellevue/123-main-street`, per-page meta tags, or an XML sitemap out of the box. To get there:
- Use a real backend/router (Next.js, a CMS, or your IDX vendor's hosted pages) that generates one real page per listing.
- Generate per page: title, meta description, Open Graph tags, and `schema.org` `RealEstateListing` structured data from the same fields already in `properties-data.js`.
- Confirm with NWMLS/your IDX vendor which statuses and fields (e.g. sold prices) are allowed to be publicly indexed.

## CRM connection
Wire `handleTourSubmit`, `handleInfoSubmit`, and the valuation/pre-approval CTAs (in the main file) to your CRM's API or webhook instead of `localStorage`.

## Files involved
- `Jack Macdonald Real Estate.dc.html` — Properties hub, property detail page, nav link, filters, mortgage calculator, forms
- `properties-data.js` — the one mock-data file to replace
- `PropertyMapSearch.dc.html` — isolated map placeholder component
- `image-slot.js` — drag-and-drop photo placeholders (already wired up)
