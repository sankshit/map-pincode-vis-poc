# Pincode Sales Map Visualization — POC Implementation Guide

This document walks through the complete implementation of the Pincode Sales Map POC. It is intended for engineers who need to understand, maintain, or productize this application for production.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [How the Map is Loaded](#2-how-the-map-is-loaded)
3. [Data Flow & Processing](#3-data-flow--processing)
4. [Geocoding Pipeline](#4-geocoding-pipeline)
5. [How Data is Shown on the Map](#5-how-data-is-shown-on-the-map)
6. [UI & Interaction](#6-ui--interaction)
7. [Project Structure](#7-project-structure)
8. [Production Considerations](#8-production-considerations)

---

## 1. Architecture Overview

The app is a React SPA that visualizes Indian pincode sales data on an interactive Leaflet map. Data can come from:

- **Bundled JSON** (`src/data/pincodeSales.json`) — shipped with the app
- **CSV upload** — user-uploaded file with pincode and sales columns

Each pincode is geocoded to lat/lng, then rendered as either:

- **Clustered markers** (default) — circle markers with size/color encoding, grouped via Leaflet.markercluster
- **Heatmap** — intensity-based heat layer using leaflet.heat

---

## 2. How the Map is Loaded

### 2.1 Map Initialization

The map is rendered by `PincodeMap.jsx` using `react-leaflet`:

```jsx
<LeafletMap
  center={[20.5937, 78.9629]}  // India center
  zoom={5}
  maxZoom={20}
  whenCreated={setMapInstance}
>
```

- **Entry point**: `App.jsx` loads `PincodeMap` and passes `pincodeSalesData` from `pincodeSales.json`.
- **Default center**: `[20.5937, 78.9629]` (India).
- **Default zoom**: 5.
- `whenCreated` stores the map instance for programmatic control (e.g. `flyTo` when selecting a pincode).

### 2.2 Tile Layer (Basemap)

Tile imagery is provided by `TileLayer` from `react-leaflet`. Multiple providers are defined in `TILE_LAYERS`:

| Key     | Provider       | Use case             |
|---------|----------------|----------------------|
| `osm`   | OpenStreetMap  | General purpose      |
| `light` | CARTO Light    | Clean base           |
| `dark`  | CARTO Dark     | Dark theme           |
| `imagery` | Esri Imagery | Satellite imagery    |
| `topo`  | Esri Topo      | Terrain/topography   |
| `streets` | Esri Streets | Roads/streets        |
| `natgeo`| NatGeo         | Stylized map         |

The selected style is stored in state (`tileStyle`). URL pattern:

```
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

`{s}` = subdomain, `{z}` = zoom, `{x}` and `{y}` = tile coordinates.

### 2.3 FitBounds (Auto-fit View)

When `autoFit` is true, a `FitBounds` component uses `useLeaflet()` to get the map instance and fits the view to all visible markers:

```jsx
useEffect(() => {
  if (bounds && bounds.length > 0) {
    const latlngs = bounds.map(coord => L.latLng(coord[0], coord[1]));
    const group = new L.featureGroup(latlngs.map(coord => L.marker(coord)));
    map.fitBounds(group.getBounds().pad(0.1));
  }
}, [bounds, map]);
```

- `bounds` = array of `[lat, lng]` for `displayData`.
- `pad(0.1)` adds 10% padding around the bounds.

### 2.4 Leaflet Icon Fix

Default Leaflet marker icons are broken in many bundlers because of path issues. The app overrides them:

```jsx
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.6.0/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.6.0/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.6.0/dist/images/marker-shadow.png",
});
```

---

## 3. Data Flow & Processing

### 3.1 Data Sources

| Source      | Location / Trigger | Shape                             |
|-------------|--------------------|-----------------------------------|
| Bundled JSON| `src/data/pincodeSales.json` | `[{ pincode, sales }, ...]`       |
| CSV upload  | User `<input type="file">`  | Parsed client-side                |

**Source selection**:

```jsx
const sourceData = uploadMeta.hasFile ? uploadedData : data;
```

If a CSV has been successfully uploaded, `uploadedData` is used; otherwise `data` (from props, i.e. `pincodeSales.json`).

### 3.2 CSV Parsing

`parseCsvFile()` in `PincodeMap.jsx` handles uploads:

1. **Read text**: `FileReader.readAsText(file)`.
2. **Parse rows**: `parseCsvText()` splits on newlines and commas; normalizes `\r\n` → `\n`.
3. **Detect headers**: First row is headers (BOM removed). Supported column aliases:
   - **Pincode**: `pincode`, `pin`, `postalcode`, `postal_code`
   - **Sales**: `sales`, `sale`, `amount`, `value`
4. **Validation**: Rows with missing pincode or invalid `sales` (not a number) are skipped.
5. **Aggregation**: Same pincode can appear multiple times; values are summed in a `Map` keyed by pincode.
6. **Output**: Array of `{ pincode, sales }` (no coordinates yet).

### 3.3 Geocoding Trigger

A `useEffect` runs when `sourceData` changes:

```jsx
useEffect(() => {
  const loadData = async () => {
    setLoading(true);
    // For each item: use coordinates if present, else geocode
    for (const item of sourceData) {
      if (item.coordinates) {
        geocoded.push(item);
      } else {
        const result = await geocodePincodeWithMeta(item.pincode);
        if (result.coords) {
          geocoded.push({ ...item, coordinates: result.coords });
        }
      }
      // 300ms delay between API calls ( Nominatim rate limit )
      if (result.source === "api") {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    setGeocodedData(geocoded);
    setLoading(false);
  };
  loadData();
}, [sourceData]);
```

- Items with existing `coordinates` skip geocoding.
- Geocoding is sequential; 300ms delay when the source is the external API.

### 3.4 Filtering & Display Data

**Filtering** (`filteredData`):

- **Search**: `item.pincode.toString().includes(normalizedSearch)`.
- **Min sales**: `item.sales >= minFilterValue`.
- **Max sales**: `item.sales <= maxFilterValue`.

**Limit** (`displayData`):

- Sorted by `sales` descending.
- Limit options: `all`, 100, 250, 500 — `displayData` is the top N items.

`displayData` is what drives markers/heatmap and stats.

---

## 4. Geocoding Pipeline

Geocoding is in `src/utils/geocode.js`. `geocodePincodeWithMeta(pincode)` returns `{ coords, source }`.

### 4.1 Resolution Order

1. **Memory cache** — in-memory `Map` for the session.
2. **localStorage cache** — `pincodeCoordinateCache_v1` for persistence.
3. **Local JSON** — `india_pincodes_lat_lng.json` (~54k Indian pincodes), shape: `{ pincode: { name, lat, lng } }`.
4. **Static fallback** — hardcoded `pincodeCoordinates` for a small set of common pincodes.
5. **Nominatim API** — `https://nominatim.openstreetmap.org/search?postalcode=…&country=India` as last resort.

### 4.2 Caching

- Successful lookups are stored in the memory cache and in `localStorage`.
- `STORAGE_KEY = "pincodeCoordinateCache_v1"` — increment version when changing cache format.

### 4.3 Nominatim

- Free, rate-limited.
- Requires `User-Agent: MapChartApp/1.0` header.
- Returns `[{ lat, lon }]`; lon is normalized to `lng` for Leaflet.

---

## 5. How Data is Shown on the Map

The UI switches between **marker clusters** and **heatmap** via `showHeatmap`.

### 5.1 Marker Cluster Mode (Default)

`PincodeCluster.jsx` uses `leaflet.markercluster`:

1. **Cluster group**:

   ```jsx
   L.markerClusterGroup({
     maxClusterRadius: 50,
     spiderfyOnMaxZoom: true,
     showCoverageOnHover: false,
     zoomToBoundsOnClick: true,
     iconCreateFunction: ...  // custom cluster icon
   })
   ```

2. **Individual markers** — `L.marker(coords)` with `L.divIcon`:
   - Size: `getRadius(sales)` → 5–25px.
   - Color: `getColor(sales)` → blue (low) to red (high) via `rgb(r, g, b)`.
   - HTML: `sales-marker-container` with gradient, optional “selected” state.

3. **Cluster icons** — `iconCreateFunction`:
   - Count, total sales, average sales from child markers.
   - Size by count: 40px (&lt;10), 50px (&lt;100), 60px (≥100).
   - Color from `getColor(avgSales)`.
   - HTML: `cluster-badge` with count and total sales.

4. **Interactions**:
   - Tooltip on hover (pincode, sales).
   - Popup on click (pincode, sales).
   - `onSelect(item)` updates parent state for the side panel and `flyTo`.

### 5.2 Color & Radius Encoding

In `PincodeMap.jsx`:

**Color** (`getColor`):

```js
const ratio = (sales - minSales) / (maxSales - minSales);
const r = Math.floor(50 + 205 * ratio);
const g = Math.floor(100 * (1 - ratio));
const b = Math.floor(200 + 55 * (1 - ratio));
return `rgb(${r}, ${g}, ${b})`;
```

- Low sales → blue (`rgb(50, 100, 200)`).
- High sales → red (`rgb(255, 0, 255)`).

**Radius** (`getRadius`):

```js
const ratio = (sales - minSales) / (maxSales - minSales);
return 5 + ratio * 20;  // 5–25px
```

`minSales` and `maxSales` are computed from `displayData`.

### 5.3 Heatmap Mode

`HeatmapLayer` uses `leaflet.heat`:

1. **Bucketing**: Data is split into low / mid / high (33rd and 66th percentiles) for radius/blur.
2. **Heat points**: `[lat, lng, intensity]` where `intensity` is 0.2–1.0 based on sales.
3. **Layer config**:

   ```js
   L.heatLayer(points, {
     radius: 18 | 28 | 38,
     blur: 14 | 20 | 26,
     maxZoom: 12,
     minOpacity: 0.25
   })
   ```

4. **Lifecycle**: `useEffect` adds/removes the heat layer when `points` or `options` change.

---

## 6. UI & Interaction

### 6.1 Layout

- **Header**: Title, subtitle, dataset info, geocode progress.
- **Upload banner**: Upload CSV, download sample, reset.
- **Toolbar**: Pincode search, min/max sales, limit, auto-fit, heatmap toggle, basemap selector, export CSV, reset filters.
- **Main area**: Map (`map-wrapper`) + side panel.

### 6.2 Side Panel

- **Overview**: Displayed count, total sales, average, max sales.
- **Selected pincode**: Pincode, sales, coordinates; note if hidden by filters.
- **Top 5**: Click to select and fly to that pincode on the map.

### 6.3 Export

`handleExportCsv()`:

- Columns: `pincode, sales, lat, lng`.
- Uses `displayData` (respects filters and limit).
- Downloads `pincode_sales_export.csv` via blob + anchor click.

### 6.4 Empty & Loading States

- **Loading**: Shown while geocoding; displays progress and failures.
- **Empty**: Map with light tiles + card prompting CSV upload or dataset update.
- **No results**: “No results match the current filters” when `displayData` is empty.

---

## 7. Project Structure

```
map_chart/
├── public/
│   ├── index.html
│   └── sample_pincode_sales.csv
├── src/
│   ├── components/
│   │   ├── PincodeMap.jsx   # Main map, data logic, filters, CSV parsing
│   │   └── PincodeCluster.jsx # Marker cluster rendering
│   ├── data/
│   │   ├── pincodeSales.json
│   │   └── india_pincodes_lat_lng.json
│   ├── utils/
│   │   └── geocode.js
│   ├── App.jsx
│   ├── index.js
│   └── styles.css
├── package.json
└── README.md
```

### Dependencies

| Package               | Version  | Role                              |
|-----------------------|----------|-----------------------------------|
| react                 | 16.12.0  | UI framework                      |
| react-dom             | 16.12.0  | DOM rendering                     |
| leaflet               | 1.6.0    | Map library                       |
| react-leaflet         | 2.6.0    | React bindings for Leaflet        |
| leaflet.heat          | ^0.2.0   | Heat layer                        |
| leaflet.markercluster | 1.4.1    | Marker clustering                 |
| react-scripts         | 3.0.1    | CRA build tooling                 |

---

## 8. Production Considerations

### 8.1 Geocoding

- Nominatim is not suitable for high-volume production.
- **Recommendation**: Use a paid geocoding API (e.g. Google, Mapbox, Here) or a backend service.
- Pre-geocode pincodes where possible and serve coordinates directly (API or static file).
- Consider server-side caching (e.g. Redis) for geocode results.

### 8.2 Data Loading

- Geocoding is currently done client-side and sequentially.
- **Recommendation**: Move geocoding to a backend; serve pre-geocoded data (e.g. `{ pincode, sales, lat, lng }`).
- For large CSVs, use streaming, chunking, or server-side processing.

### 8.3 Performance

- `india_pincodes_lat_lng.json` is ~54k entries — adds to bundle size.
- **Recommendation**: Lazy-load or split by region; or move to API.
- For thousands of markers, consider:
  - Web workers for geocoding.
  - Server-side clustering/aggregation.
  - Level-of-detail (fewer markers at lower zoom).

### 8.4 Security & Privacy

- Pincode/sales data is processed in the browser; no server round-trip by default.
- Nominatim requests go to OSM; ensure compliance with their usage policy.
- CSV uploads are not sanitized beyond parsing; validate and limit size on a backend if you add one.

### 8.5 Infrastructure

- Map tiles come from third parties (OSM, CARTO, Esri); check ToS and rate limits.
- For production, consider self-hosted tiles or a paid tile provider.
- CRA build is static; can be deployed to any static host (e.g. S3, Netlify, Vercel).

### 8.6 Feature Gaps

- No auth or role-based access.
- No backend; all logic is client-side.
- No real-time updates or WebSockets.
- No time-series or date filtering.
- Limited error handling and retry for geocoding.
- No unit or integration tests.

### 8.7 Suggested Roadmap

1. **Phase 1**: Backend API for geocoding + pre-geocoded dataset; move heavy work off the client.
2. **Phase 2**: Auth, RBAC, data validation, rate limiting.
3. **Phase 3**: More filters, date range, time-series views, export options.
4. **Phase 4**: Tests, monitoring, error tracking, and performance tuning.

---

## Quick Reference: Key Files

| File                 | Responsibility                                           |
|----------------------|----------------------------------------------------------|
| `PincodeMap.jsx`     | Map, data, CSV parsing, filters, heatmap/markers, export |
| `PincodeCluster.jsx` | Leaflet.markercluster rendering and cluster icons        |
| `geocode.js`         | Pincode → lat/lng with cache and fallbacks               |
| `pincodeSales.json`  | Default pincode + sales dataset                          |
| `india_pincodes_lat_lng.json` | Large pincode lookup table                        |

---

*This POC demonstrates core mapping and data visualization patterns. Production use requires backend services, caching, and hardening as outlined above.*
