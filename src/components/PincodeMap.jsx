import React, { useEffect, useMemo, useRef, useState } from "react";
import { Map as LeafletMap, TileLayer, useLeaflet } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { geocodePincodeWithMeta } from "../utils/geocode";
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

const HeatmapLayer = ({ points, options }) => {
  const { map } = useLeaflet();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!points || points.length === 0) return;

    const layer = L.heatLayer(points, options);
    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, options]);

  return null;
};

const TILE_LAYERS = {
  osm: {
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 19
  },
  light: {
    label: "Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://carto.com/attributions">CARTO</a> contributors',
    maxNativeZoom: 19
  },
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://carto.com/attributions">CARTO</a> contributors',
    maxNativeZoom: 19
  },
  imagery: {
    label: "Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, " +
      "Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    maxNativeZoom: 19
  },
  topo: {
    label: "Topographic",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, " +
      "iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community",
    maxNativeZoom: 19
  },
  streets: {
    label: "Streets",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, " +
      "iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community",
    maxNativeZoom: 19
  },
  natgeo: {
    label: "NatGeo",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, " +
      "USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, and the GIS User Community",
    maxNativeZoom: 16
  }
};

const parseCsvText = (text) => {
  const safeText = typeof text === "string" ? text : "";
  const normalized = safeText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => line.split(",").map((cell) => cell.trim()));
};

const PincodeMap = ({ data }) => {
  const [uploadedData, setUploadedData] = useState([]);
  const [uploadMeta, setUploadMeta] = useState({
    hasFile: false,
    fileName: "",
    validRows: 0,
    invalidRows: 0,
    usedLatLng: 0
  });
  const [uploadError, setUploadError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
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
  const [tileStyle, setTileStyle] = useState("imagery");
  const [autoFit, setAutoFit] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedPincode, setSelectedPincode] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const sourceData = uploadMeta.hasFile ? uploadedData : data;

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const geocoded = [];
      const total = sourceData ? sourceData.length : 0;
      const geocodeTargets = sourceData
        ? sourceData.filter((item) => !item.coordinates)
        : [];
      const geocodeTotal = geocodeTargets.length;
      let failures = 0;
      setGeocodeProgress({ current: 0, total: geocodeTotal, failures: 0 });

      if (sourceData && sourceData.length > 0) {
        let index = 0;
        for (const item of sourceData) {
          if (item.coordinates) {
            geocoded.push(item);
            setGeocodedData([...geocoded]);
            index += 1;
            setGeocodeProgress({ current: index, total: geocodeTotal, failures });
            continue;
          }
          const result = await geocodePincodeWithMeta(item.pincode);
          if (result.coords) {
            geocoded.push({
              ...item,
              coordinates: result.coords,
            });
            setGeocodedData([...geocoded]);
          } else {
            failures += 1;
          }
          // Add delay only when we made an API call
          if (result.source === "api") {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          index += 1;
          setGeocodeProgress({ current: index, total: geocodeTotal, failures });
        }
      }

      setGeocodedData(geocoded);
      setLoading(false);
    };

    loadData();
  }, [sourceData]);

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

  const salesValues = useMemo(() => (
    displayData.length > 0 ? displayData.map(item => item.sales) : [0]
  ), [displayData]);
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

  const displayBounds = useMemo(() => {
    return displayData.map(item => item.coordinates);
  }, [displayData]);

  const heatmapGroups = useMemo(() => {
    if (displayData.length === 0) return [];
    const values = displayData.map(item => item.sales);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;
    const buckets = [
      { id: "low", radius: 18, blur: 14, points: [] },
      { id: "mid", radius: 28, blur: 20, points: [] },
      { id: "high", radius: 38, blur: 26, points: [] }
    ];

    displayData.forEach((item) => {
      const ratio = range === 0 ? 0.5 : (item.sales - minValue) / range;
      const intensity = range === 0 ? 0.6 : 0.2 + 0.8 * ratio;
      const bucketIndex = ratio < 0.33 ? 0 : ratio < 0.66 ? 1 : 2;
      buckets[bucketIndex].points.push([
        item.coordinates[0],
        item.coordinates[1],
        intensity
      ]);
    });

    return buckets.filter(bucket => bucket.points.length > 0);
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
    setSelectedPincode(null);
  };

  const handleResetUpload = () => {
    setUploadedData([]);
    setUploadMeta({
      hasFile: false,
      fileName: "",
      validRows: 0,
      invalidRows: 0,
      usedLatLng: 0
    });
    setUploadError("");
    handleClearFilters();
  };

  const parseCsvFile = (text, fileName) => {
    const rows = parseCsvText(text);
    console.debug("[CSV Upload] Parsed rows", {
      fileName,
      totalRows: rows.length,
      sample: rows.slice(0, 3)
    });
    if (rows.length === 0) {
      throw new Error("The file is empty. Please upload a CSV with headers.");
    }

    if (!rows[0] || !Array.isArray(rows[0])) {
      console.debug("[CSV Upload] Invalid header row", { headerRow: rows[0] });
      throw new Error("Invalid CSV header row.");
    }

    const headerRow = rows[0].map((cell, index) => {
      const trimmed = typeof cell === "string" ? cell.trim() : String(cell ?? "").trim();
      const cleaned = index === 0 ? trimmed.replace(/^\uFEFF/, "") : trimmed;
      return cleaned.toLowerCase();
    });
    const indexOf = (aliases) =>
      aliases.map((name) => headerRow.indexOf(name)).find((idx) => idx >= 0);
    const pincodeIndex = indexOf(["pincode", "pin", "postalcode", "postal_code"]);
    const salesIndex = indexOf(["sales", "sale", "amount", "value"]);

    if (pincodeIndex === undefined || salesIndex === undefined) {
      console.debug("[CSV Upload] Missing required columns", {
        headerRow,
        pincodeIndex,
        salesIndex
      });
      throw new Error("Missing required columns. CSV must include pincode and sales.");
    }

    const aggregated = new Map();
    let invalidRows = 0;

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!Array.isArray(row)) {
        invalidRows += 1;
        continue;
      }
      const rawPincode = row[pincodeIndex] ? row[pincodeIndex].trim() : "";
      const rawSales = row[salesIndex] ? row[salesIndex].trim() : "";
      const sales = Number(rawSales);
      if (!rawPincode || Number.isNaN(sales)) {
        invalidRows += 1;
        continue;
      }

      const existing = aggregated.get(rawPincode) || {
        pincode: rawPincode,
        sales: 0,
      };
      existing.sales += sales;

      aggregated.set(rawPincode, existing);
    }

    const parsedRows = Array.from(aggregated.values());

    if (parsedRows.length === 0) {
      console.debug("[CSV Upload] No valid rows after parsing", {
        invalidRows,
        totalRows: rows.length
      });
      throw new Error("No valid rows found. Check pincode and sales values.");
    }

    setUploadedData(parsedRows);
    setUploadMeta({
      hasFile: true,
      fileName,
      validRows: parsedRows.length,
      invalidRows,
      usedLatLng: 0
    });
    setUploadError("");
    handleClearFilters();
  };

  const handleUpload = (event) => {
    const inputEl = event.target;
    const file = inputEl && inputEl.files && inputEl.files[0];
    if (!file) return;

    setIsParsing(true);
    const reader = new FileReader();

    reader.onload = () => {
      try {
        console.debug("[CSV Upload] File loaded", {
          fileName: file.name,
          size: file.size,
          type: file.type
        });
        parseCsvFile(reader.result || "", file.name);
      } catch (error) {
        console.error("[CSV Upload] Parse failed", {
          fileName: file.name,
          error
        });
        setUploadError(error.message || "Unable to parse CSV file.");
        setUploadedData([]);
        setUploadMeta({
          hasFile: true,
          fileName: file.name,
          validRows: 0,
          invalidRows: 0,
          usedLatLng: 0
        });
      } finally {
        setIsParsing(false);
        if (inputEl && typeof inputEl.value !== "undefined") {
          inputEl.value = "";
        }
      }
    };

    reader.onerror = () => {
      setUploadError("Failed to read the file. Please try again.");
      setIsParsing(false);
      if (inputEl && typeof inputEl.value !== "undefined") {
        inputEl.value = "";
      }
    };

    reader.readAsText(file);
  };

  if (loading && geocodedData.length === 0) {
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
      <div className="empty-state">
        <LeafletMap
          center={[20.5937, 78.9629]}
          zoom={5}
          style={{ height: "70vh", width: "100%" }}
          maxZoom={20}
        >
          <TileLayer
            url={TILE_LAYERS.light.url}
            attribution={TILE_LAYERS.light.attribution}
          />
        </LeafletMap>
        <div className="empty-card">
          <div className="empty-title">No pincode data found</div>
          <div className="empty-subtitle">
            Upload a CSV or update the bundled dataset to begin.
          </div>
          {uploadError ? (
            <div className="upload-status error">
              <div>
                <strong>{uploadMeta.fileName || "Upload error"}</strong>
                <div className="upload-meta">{uploadError}</div>
              </div>
              <button className="button ghost" type="button" onClick={handleResetUpload}>
                Clear
              </button>
            </div>
          ) : null}
          <div className="empty-actions">
            <label className="button" htmlFor="csv-upload-empty">
              Upload CSV
            </label>
            <a className="button ghost" href="/sample_pincode_sales.csv" download>
              Download sample
            </a>
            <input
              id="csv-upload-empty"
              className="file-input"
              type="file"
              accept=".csv"
              onChange={handleUpload}
            />
          </div>
          <div className="empty-footnote">
            Required columns: <strong>pincode</strong>, <strong>sales</strong>.
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
          <div className="meta-chip">
            {uploadMeta.hasFile ? `Uploaded: ${uploadMeta.fileName}` : "Bundled dataset"}
          </div>
          {loading ? (
            <div className="meta-chip">
              {geocodeProgress.total > 0
                ? `Geocoding ${geocodeProgress.current}/${geocodeProgress.total}`
                : "Preparing geocoding"}
              {geocodeProgress.failures > 0 ? ` • ${geocodeProgress.failures} failed` : ""}
            </div>
          ) : null}
        </div>
      </div>

      <div className="upload-banner">
        <div>
          <div className="upload-title">Data source</div>
          <div className="upload-subtitle">
            Upload a CSV with pincode and sales only. We handle geocoding.
          </div>
        </div>
        <div className="upload-actions">
          <label className="button" htmlFor="csv-upload-main">
            {isParsing ? "Parsing..." : "Upload CSV"}
          </label>
          <a className="button ghost" href="/sample_pincode_sales.csv" download>
            Download sample
          </a>
          {uploadMeta.hasFile ? (
            <button className="button ghost" type="button" onClick={handleResetUpload}>
              Reset upload
            </button>
          ) : null}
          <input
            id="csv-upload-main"
            className="file-input"
            type="file"
            accept=".csv"
            onChange={handleUpload}
            disabled={isParsing}
          />
        </div>
      </div>
      {uploadMeta.hasFile ? (
        <div className={`upload-status ${uploadError ? "error" : ""}`}>
          <div>
            <strong>{uploadMeta.fileName}</strong>
            <div className="upload-meta">
              {uploadError
                ? uploadError
                : `${uploadMeta.validRows} valid rows` +
                  (uploadMeta.invalidRows ? ` • ${uploadMeta.invalidRows} invalid` : "")}
            </div>
          </div>
          {uploadError ? (
            <button className="button ghost" type="button" onClick={handleResetUpload}>
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

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
          <label className="toggle">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(event) => setShowHeatmap(event.target.checked)}
            />
            Heatmap
          </label>
          <label className="field">
            <span>Basemap</span>
            <select
              value={tileStyle}
              onChange={(event) => setTileStyle(event.target.value)}
            >
              {Object.entries(TILE_LAYERS || {}).map(([key, layer]) => (
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
          <LeafletMap
            center={defaultCenter}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            maxZoom={20}
            whenCreated={setMapInstance}
          >
            <TileLayer
              url={tileLayer.url}
              attribution={tileLayer.attribution}
              maxNativeZoom={tileLayer.maxNativeZoom}
              detectRetina
            />
            {autoFit && displayBounds.length > 0 ? (
              <FitBounds bounds={displayBounds} />
            ) : null}
            {showHeatmap ? (
              heatmapGroups.map((group) => (
                <HeatmapLayer
                  key={group.id}
                  points={group.points}
                  options={{
                    radius: group.radius,
                    blur: group.blur,
                    maxZoom: 12,
                    minOpacity: 0.25
                  }}
                />
              ))
            ) : (
              <PincodeCluster 
                geocodedData={displayData}
                getColor={getColor}
                getRadius={getRadius}
                formatSales={formatSales}
                selectedPincode={selectedPincode}
                onSelect={(item) => setSelectedPincode(item.pincode)}
              />
            )}
          </LeafletMap>
          <div className="map-legend">
            <strong>Legend:</strong>{" "}
            {showHeatmap
              ? "Heat intensity represents relative sales (hotter = higher sales)."
              : "Circle size and color represent sales value (larger/darker = higher sales)."}
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
