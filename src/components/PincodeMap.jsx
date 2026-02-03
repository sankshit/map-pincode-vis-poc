import React, { useEffect, useState } from "react";
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

const PincodeMap = ({ data }) => {
  const [geocodedData, setGeocodedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bounds, setBounds] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const geocoded = [];
      const boundsArray = [];

      if (data && data.length > 0) {
        for (const item of data) {
          const coords = await geocodePincode(item.pincode);
          if (coords) {
            geocoded.push({
              ...item,
              coordinates: coords,
            });
            boundsArray.push(coords);
          }
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      setGeocodedData(geocoded);
      setBounds(boundsArray);
      setLoading(false);
    };

    loadData();
  }, [data]);

  // Calculate min and max sales for scaling
  const salesValues = geocodedData.length > 0 ? geocodedData.map(item => item.sales) : [0];
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

  if (loading) {
    return (
      <div style={{ 
        height: "90vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        fontSize: "18px"
      }}>
        Loading pincode data and geocoding...
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

  // Default center (India)
  const defaultCenter = [20.5937, 78.9629];

  return (
    <div>
      <Map
        center={defaultCenter}
        zoom={5}
        style={{ height: "90vh", width: "100%" }}
        maxZoom={20}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitBounds bounds={bounds} />
        <PincodeCluster 
          geocodedData={geocodedData}
          getColor={getColor}
          getRadius={getRadius}
          formatSales={formatSales}
        />
      </Map>
      
      <div style={{ 
        padding: "10px", 
        backgroundColor: "#f0f0f0",
        borderTop: "1px solid #ccc"
      }}>
        <strong>Legend:</strong> Circle size and color represent sales value (larger/darker = higher sales)
      </div>
    </div>
  );
};

export default PincodeMap;
