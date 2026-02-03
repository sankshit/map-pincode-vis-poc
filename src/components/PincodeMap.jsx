import React, { useEffect, useMemo, useState } from "react";
import { Map, TileLayer, useLeaflet } from "react-leaflet";
import L from "leaflet";
import { geocodePincode } from "../utils/geocode";
import PincodeCluster from "./PincodeCluster";

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.6.0/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.6.0/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.6.0/dist/images/marker-shadow.png",
});

// Component to fit map bounds to show all markers
const FitBounds = ({ bounds }) => {
  const { map } = useLeaflet();
  
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      const latlngs = bounds.map(coord => L.latLng(coord[0], coord[1]));
      const group = new L.featureGroup(latlngs.map(coord => L.marker(coord)));
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }, [bounds, map]);
  
  return null;
};

const TILE_LAYERS = {
  light: {
    label: "Light",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://carto.com/attributions">CARTO</a> contributors'
  }
};

const PincodeMap = ({ data }) => {
  const [geocodedData, setGeocodedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocodeProgress, setGeocodeProgress] = useState({
    current: 0,
    total: 0,
    failures: 0
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [minSalesFilter, setMinSalesFilter] = useState("");
  const [maxSalesFilter, setMaxSalesFilter] = useState("");
  const [limit, setLimit] = useState("all");
  const [tileStyle, setTileStyle] = useState("light");
  const [autoFit, setAutoFit] = useState(true);
  const [selectedPincode, setSelectedPincode] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const geocoded = [];
      const total = data ? data.length : 0;
      let failures = 0;
      setGeocodeProgress({ current: 0, total, failures: 0 });

      if (data && data.length > 0) {
        let index = 0;
        for (const item of data) {
          const coords = await geocodePincode(item.pincode);
          if (coords) {
            geocoded.push({
              ...item,
              coordinates: coords,
            });
          } else {
            failures += 1;
          }
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
          index += 1;
          setGeocodeProgress({ current: index, total, failures });
        }
      }

      setGeocodedData(geocoded);
      setLoading(false);
    };

    loadData();
  }, [data]);

  const salesValues = useMemo(() => (
    geocodedData.length > 0 ? geocodedData.map(item => item.sales) : [0]
  ), [geocodedData]);
  const minSales = salesValues.length > 0 ? Math.min(...salesValues) : 0;
  const maxSales = salesValues.length > 0 ? Math.max(...salesValues) : 1;

  // Function to get color based on sales value
  const getColor = (sales) => {
    if (maxSales === minSales) return "#3388ff";
    const ratio = (sales - minSales) / (maxSales - minSales);
    // Color gradient from blue (low) to red (high) - improved colors
    const r = Math.floor(50 + 205 * ratio);
    const g = Math.floor(100 * (1 - ratio));
    const b = Math.floor(200 + 55 * (1 - ratio));
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Function to get radius based on sales value
  const getRadius = (sales) => {
    if (maxSales === minSales) return 8;
    const ratio = (sales - minSales) / (maxSales - minSales);
    return 5 + ratio * 20; // Radius between 5 and 25
  };

  // Format sales value for display
  const formatSales = (sales) => {
    if (sales >= 1000000) {
      return `₹${(sales / 1000000).toFixed(2)}M`;
    } else if (sales >= 1000) {
      return `₹${(sales / 1000).toFixed(1)}K`;
    }
    return `₹${sales}`;
  };

  const normalizedSearch = searchTerm.trim();
  const minFilterValue = minSalesFilter === "" ? null : Number(minSalesFilter);
  const maxFilterValue = maxSalesFilter === "" ? null : Number(maxSalesFilter);

  const filteredData = useMemo(() => {
    return geocodedData.filter((item) => {
      const matchesSearch = normalizedSearch
        ? item.pincode.toString().includes(normalizedSearch)
        : true;
      const matchesMin = minFilterValue === null ? true : item.sales >= minFilterValue;
      const matchesMax = maxFilterValue === null ? true : item.sales <= maxFilterValue;
      return matchesSearch && matchesMin && matchesMax;
    });
  }, [geocodedData, normalizedSearch, minFilterValue, maxFilterValue]);

  const displayData = useMemo(() => {
    const sorted = [...filteredData].sort((a, b) => b.sales - a.sales);
    if (limit === "all") {
      return sorted;
    }
    const limitValue = Number(limit);
    return Number.isNaN(limitValue) ? sorted : sorted.slice(0, limitValue);
  }, [filteredData, limit]);

  const displayBounds = useMemo(() => {
    return displayData.map(item => item.coordinates);
  }, [displayData]);

  const totalSales = useMemo(() => (
    displayData.reduce((sum, item) => sum + item.sales, 0)
  ), [displayData]);
  const averageSales = displayData.length > 0 ? totalSales / displayData.length : 0;
  const maxDisplaySales = displayData.length > 0
    ? Math.max(...displayData.map(item => item.sales))
    : 0;

  const selectedItem = useMemo(() => (
    geocodedData.find(item => item.pincode === selectedPincode) || null
  ), [geocodedData, selectedPincode]);
  const selectedIsVisible = useMemo(() => (
    displayData.some(item => item.pincode === selectedPincode)
  ), [displayData, selectedPincode]);

  useEffect(() => {
    if (mapInstance && selectedItem && selectedIsVisible) {
      const targetZoom = Math.max(mapInstance.getZoom(), 8);
      mapInstance.flyTo(selectedItem.coordinates, targetZoom, { duration: 0.6 });
    }
  }, [mapInstance, selectedItem, selectedIsVisible]);

  const handleExportCsv = () => {
    const header = ["pincode", "sales", "lat", "lng"];
    const rows = displayData.map(item => [
      item.pincode,
      item.sales,
      item.coordinates[0],
      item.coordinates[1]
    ]);
    const csv = [header, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "pincode_sales_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setMinSalesFilter("");
    setMaxSalesFilter("");
    setLimit("all");
  };

  if (loading) {
    return (
      <div className="loading-panel">
        <div className="loading-title">Loading pincode data and geocoding...</div>
        <div className="loading-subtitle">
          {geocodeProgress.total > 0
            ? `Processed ${geocodeProgress.current} of ${geocodeProgress.total}`
            : "Preparing dataset"}
          {geocodeProgress.failures > 0
            ? ` • ${geocodeProgress.failures} failed`
            : ""}
        </div>
      </div>
    );
  }

  if (geocodedData.length === 0 && !loading) {
    return (
      <div>
        <Map
          center={[20.5937, 78.9629]}
          zoom={5}
          style={{ height: "90vh", width: "100%" }}
          maxZoom={20}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
        </Map>
        <div style={{ 
          padding: "20px", 
          backgroundColor: "#fff3cd",
          borderTop: "2px solid #ffc107",
          textAlign: "center"
        }}>
          <strong style={{ fontSize: "18px", display: "block", marginBottom: "10px" }}>
            No pincode data found
          </strong>
          <div style={{ fontSize: "14px", color: "#856404" }}>
            Please add your pincode and sales data to <code>src/data/pincodeSales.json</code>
            <br />
            <br />
            <strong>Expected format:</strong>
            <pre style={{ 
              display: "inline-block", 
              textAlign: "left", 
              backgroundColor: "#f8f9fa",
              padding: "10px",
              borderRadius: "4px",
              marginTop: "10px"
            }}>
{`[
  {
    "pincode": "110001",
    "sales": 125000
  },
  {
    "pincode": "400001",
    "sales": 98000
  }
]`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  const tileLayer = TILE_LAYERS[tileStyle];
  const topPincodes = displayData.slice(0, 5);

  // Default center (India)
  const defaultCenter = [20.5937, 78.9629];

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title">Pincode Sales Intelligence</div>
          <div className="dashboard-subtitle">
            Filter, inspect, and export sales signals across India
          </div>
        </div>
        <div className="header-meta">
          <div className="meta-chip">{geocodedData.length} pincodes</div>
          <div className="meta-chip">Updated just now</div>
        </div>
      </div>

      <div className="dashboard-toolbar">
        <div className="toolbar-group">
          <label className="field">
            <span>Pincode search</span>
            <input
              type="search"
              placeholder="e.g. 110001"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Min sales</span>
            <input
              type="number"
              min="0"
              value={minSalesFilter}
              onChange={(event) => setMinSalesFilter(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Max sales</span>
            <input
              type="number"
              min="0"
              value={maxSalesFilter}
              onChange={(event) => setMaxSalesFilter(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Limit</span>
            <select value={limit} onChange={(event) => setLimit(event.target.value)}>
              <option value="all">All</option>
              <option value="100">Top 100</option>
              <option value="250">Top 250</option>
              <option value="500">Top 500</option>
            </select>
          </label>
        </div>
        <div className="toolbar-group">
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoFit}
              onChange={(event) => setAutoFit(event.target.checked)}
            />
            Auto-fit view
          </label>
          <label className="field">
            <span>Basemap</span>
            <select
              value={tileStyle}
              onChange={(event) => setTileStyle(event.target.value)}
            >
              {Object.entries(TILE_LAYERS).map(([key, layer]) => (
                <option key={key} value={key}>{layer.label}</option>
              ))}
            </select>
          </label>
          <button className="button" type="button" onClick={handleExportCsv}>
            Export CSV
          </button>
          <button className="button ghost" type="button" onClick={handleClearFilters}>
            Reset filters
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="map-wrapper">
          <Map
            center={defaultCenter}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            maxZoom={20}
            whenCreated={setMapInstance}
          >
            <TileLayer url={tileLayer.url} attribution={tileLayer.attribution} />
            {autoFit && displayBounds.length > 0 ? (
              <FitBounds bounds={displayBounds} />
            ) : null}
            <PincodeCluster 
              geocodedData={displayData}
              getColor={getColor}
              getRadius={getRadius}
              formatSales={formatSales}
              selectedPincode={selectedPincode}
              onSelect={(item) => setSelectedPincode(item.pincode)}
            />
          </Map>
          <div className="map-legend">
            <strong>Legend:</strong> Circle size and color represent sales value (larger/darker = higher sales)
          </div>
        </div>

        <div className="side-panel">
          <div className="panel-section">
            <div className="panel-title">Overview</div>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Displayed pincodes</div>
                <div className="stat-value">{displayData.length}</div>
                <div className="stat-footnote">of {geocodedData.length} total</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Displayed sales</div>
                <div className="stat-value">{formatSales(totalSales)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Average sales</div>
                <div className="stat-value">{formatSales(Math.round(averageSales))}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Max sales</div>
                <div className="stat-value">{formatSales(maxDisplaySales)}</div>
              </div>
            </div>
            {displayData.length === 0 ? (
              <div className="panel-note">
                No results match the current filters.
              </div>
            ) : null}
          </div>

          <div className="panel-section">
            <div className="panel-title">Selected pincode</div>
            {selectedItem ? (
              <div className="selection-card">
                <div className="selection-row">
                  <span>Pincode</span>
                  <strong>{selectedItem.pincode}</strong>
                </div>
                <div className="selection-row">
                  <span>Sales</span>
                  <strong>{formatSales(selectedItem.sales)}</strong>
                </div>
                <div className="selection-row">
                  <span>Coordinates</span>
                  <strong>
                    {selectedItem.coordinates[0].toFixed(4)}, {selectedItem.coordinates[1].toFixed(4)}
                  </strong>
                </div>
                {!selectedIsVisible ? (
                  <div className="panel-note">
                    Selected pincode is hidden by current filters.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="panel-note">Click a marker or list item to inspect details.</div>
            )}
          </div>

          <div className="panel-section">
            <div className="panel-title">Top performing pincodes</div>
            {topPincodes.length === 0 ? (
              <div className="panel-note">No pincodes to display.</div>
            ) : (
              <div className="top-list">
                {topPincodes.map((item) => (
                  <button
                    key={item.pincode}
                    type="button"
                    className={`top-item ${selectedPincode === item.pincode ? "active" : ""}`}
                    onClick={() => setSelectedPincode(item.pincode)}
                  >
                    <span>{item.pincode}</span>
                    <strong>{formatSales(item.sales)}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PincodeMap;
