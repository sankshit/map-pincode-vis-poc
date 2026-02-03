# Pincode Sales Map Visualization - POC

A React-based proof of concept application that visualizes sales data by Indian pincodes on an interactive map using Leaflet. This application displays sales information as color-coded and size-scaled markers with clustering capabilities for better visualization.

## Features

-  **Interactive Map**: Built with Leaflet and React-Leaflet for smooth map interactions
-  **Marker Clustering**: Automatically clusters nearby markers for better performance and readability
-  **Visual Encoding**: 
  - Color gradient (blue to red) represents sales value
  - Marker size scales with sales amount
-  **Rich Tooltips & Popups**: Hover tooltips and click popups show detailed sales information
-  **Auto-fit Bounds**: Map automatically adjusts to show all markers
-  **Cluster Information**: Click on clusters to see aggregated statistics (total sales, average sales, pincode count)

## Tech Stack

- **React** 16.12.0
- **Leaflet** 1.6.0 - Map library
- **React-Leaflet** 2.6.0 - React bindings for Leaflet
- **Leaflet.markercluster** 1.4.1 - Marker clustering plugin
- **React Scripts** 3.0.1 - Build tooling

## Prerequisites

- Node.js (v12 or higher recommended)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd map_chart
```

2. Install dependencies:
```bash
npm install
```

## Usage

1. **Prepare your data**: Add your pincode and sales data to `src/data/pincodeSales.json`:
```json
[
  {
    "pincode": "110001",
    "sales": 125000
  },
  {
    "pincode": "400001",
    "sales": 98000
  }
]
```

2. **Start the development server**:
```bash
npm start
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

The application will:
- Load pincode data from `pincodeSales.json`
- Geocode each pincode to get coordinates (using OpenStreetMap Nominatim API)
- Display markers on the map with visual encoding based on sales values
- Automatically fit the map bounds to show all markers

## Project Structure

```
map_chart/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── components/
│   │   ├── PincodeMap.jsx      # Main map component
│   │   └── PincodeCluster.jsx  # Marker clustering component
│   ├── data/
│   │   └── pincodeSales.json   # Sales data by pincode
│   ├── utils/
│   │   └── geocode.js          # Geocoding utilities
│   ├── App.jsx                  # Root component
│   ├── index.js                 # Entry point
│   └── styles.css               # Application styles
├── package.json
└── README.md
```

## Geocoding

The application uses OpenStreetMap's Nominatim API for geocoding pincodes. The `src/utils/geocode.js` file includes:

- A local cache of common Indian pincodes for faster loading
- Fallback to Nominatim API for unmapped pincodes
- Rate limiting protection (300ms delay between requests)

**Note**: The Nominatim API is free but rate-limited. For production use, consider:
- Using a commercial geocoding service
- Implementing a backend caching layer
- Expanding the local pincode coordinate cache

## Customization

### Changing Sales Data

Edit `src/data/pincodeSales.json` with your pincode and sales data.

### Adjusting Visual Encoding

Modify the `getColor()` and `getRadius()` functions in `src/components/PincodeMap.jsx` to change how sales values are visualized.

### Map Tile Provider

Change the tile layer URL in `PincodeMap.jsx` to use a different map provider (e.g., Mapbox, Google Maps).

## Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` folder.

## Limitations & Future Improvements

- **Geocoding Rate Limits**: Current implementation uses free Nominatim API with rate limiting
- **Data Format**: Currently supports only JSON format for sales data
- **Pincode Support**: Optimized for Indian pincodes; can be extended for other countries
- **Performance**: Large datasets (>1000 pincodes) may require optimization

### Potential Enhancements:
- Backend API for geocoding and data management
- Real-time data updates
- Filtering and search capabilities
- Export functionality (PNG, PDF)
- Time-series visualization
- Multiple data layers

## License

This is a proof of concept project. Use as needed.

## Contributing

This is a POC project. For improvements or issues, please create an issue or submit a pull request.
