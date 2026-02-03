import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster/dist/leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useLeaflet } from "react-leaflet";

const PincodeCluster = ({ geocodedData, getColor, getRadius, formatSales }) => {
  const { map } = useLeaflet();
  const markerClusterGroupRef = useRef(null);

  useEffect(() => {
    if (!map || !geocodedData || geocodedData.length === 0) return;

    // Clear existing cluster group
    if (markerClusterGroupRef.current) {
      map.removeLayer(markerClusterGroupRef.current);
    }

    // Create new cluster group with custom styling
    const markerClusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        const markers = cluster.getAllChildMarkers();
        const totalSales = markers.reduce((sum, marker) => {
          return sum + (marker.options.sales || 0);
        }, 0);
        const avgSales = totalSales / count;
        
        // Create custom cluster icon
        const size = count < 10 ? 40 : count < 100 ? 50 : 60;
        const color = getColor(avgSales);
        const totalSalesText = formatSales(totalSales);
        
        // Store cluster data for popup
        cluster.totalSales = totalSales;
        cluster.avgSales = avgSales;
        cluster.markerCount = count;
        
        return L.divIcon({
          html: `<div class="cluster-badge" style="
            width: ${size}px;
            height: ${size}px;
            background: linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -18)} 100%);
          ">
            <div class="cluster-ring"></div>
            <div class="cluster-content">
              <div class="cluster-count">${count}</div>
              <div class="cluster-sales">${totalSalesText}</div>
            </div>
          </div>`,
          className: "custom-cluster-icon",
          iconSize: L.point(size, size)
        });
      }
    });

    // Add markers to cluster group
    geocodedData.forEach((item) => {
      const radius = getRadius(item.sales);
      const salesText = formatSales(item.sales);
      const color = getColor(item.sales);
      
      // Create custom marker icon with better design
      const customIcon = L.divIcon({
        className: "custom-sales-marker",
        html: `<div class="sales-marker-container" style="
          width: ${radius * 2}px;
          height: ${radius * 2}px;
        ">
          <div class="sales-marker-glow" style="
            background: ${adjustColor(color, -30)};
            width: ${radius * 2}px;
            height: ${radius * 2}px;
          "></div>
          <div class="sales-marker-circle" style="
            background: linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -22)} 100%);
            width: ${radius * 2}px;
            height: ${radius * 2}px;
            font-size: ${Math.max(10, Math.min(16, radius * 0.65))}px;
          ">${salesText}</div>
        </div>`,
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius]
      });

      const marker = L.marker(item.coordinates, {
        icon: customIcon,
        sales: item.sales,
        pincode: item.pincode
      });

      // Add tooltip on hover
      marker.bindTooltip(
        `<div style="text-align: center; font-weight: bold;">
          <div>Pincode: ${item.pincode}</div>
          <div style="color: ${color}; margin-top: 4px;">Sales: ${salesText}</div>
        </div>`,
        {
          permanent: false,
          direction: 'top',
          offset: [0, -radius - 5],
          className: 'custom-tooltip',
          opacity: 0.95
        }
      );

      // Add popup on click
      marker.bindPopup(
        `<div style="text-align: center; padding: 5px;">
          <strong style="font-size: 16px;">Pincode: ${item.pincode}</strong>
          <br />
          <div style="color: ${color}; font-size: 18px; font-weight: bold; margin-top: 8px;">
            Sales: ${salesText}
          </div>
        </div>`
      );

      markerClusterGroup.addLayer(marker);
    });

    // Add popup to cluster groups
    markerClusterGroup.on('clusterclick', function(a) {
      const cluster = a.layer;
      const count = cluster.getChildCount();
      const totalSales = cluster.totalSales || 0;
      const avgSales = cluster.avgSales || 0;
      const totalSalesText = formatSales(totalSales);
      const avgSalesText = formatSales(avgSales);
      
      const popupContent = `
        <div style="text-align: center; padding: 10px; min-width: 200px;">
          <strong style="font-size: 18px;">Cluster Information</strong>
          <hr style="margin: 10px 0; border: none; border-top: 1px solid #ddd;" />
          <div style="margin: 8px 0;">
            <strong>Pincodes:</strong> ${count}
          </div>
          <div style="margin: 8px 0; color: ${getColor(avgSales)};">
            <strong>Total Sales:</strong> ${totalSalesText}
          </div>
          <div style="margin: 8px 0; color: ${getColor(avgSales)};">
            <strong>Average Sales:</strong> ${avgSalesText}
          </div>
        </div>
      `;
      
      L.popup()
        .setLatLng(cluster.getLatLng())
        .setContent(popupContent)
        .openOn(map);
    });

    map.addLayer(markerClusterGroup);
    markerClusterGroupRef.current = markerClusterGroup;

    // Cleanup
    return () => {
      if (markerClusterGroupRef.current) {
        map.removeLayer(markerClusterGroupRef.current);
      }
    };
  }, [map, geocodedData, getColor, getRadius, formatSales]);

  return null;
};

// Helper function to adjust color brightness
function adjustColor(color, amount) {
  // Handle rgb() format
  if (color.startsWith('rgb')) {
    const matches = color.match(/\d+/g);
    if (matches && matches.length >= 3) {
      let r = parseInt(matches[0]) + amount;
      let g = parseInt(matches[1]) + amount;
      let b = parseInt(matches[2]) + amount;
      r = r > 255 ? 255 : r < 0 ? 0 : r;
      g = g > 255 ? 255 : g < 0 ? 0 : g;
      b = b > 255 ? 255 : b < 0 ? 0 : b;
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  // Handle hex format
  const usePound = color[0] === "#";
  const col = usePound ? color.slice(1) : color;
  const num = parseInt(col, 16);
  let r = (num >> 16) + amount;
  let g = (num >> 8 & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  r = r > 255 ? 255 : r < 0 ? 0 : r;
  g = g > 255 ? 255 : g < 0 ? 0 : g;
  b = b > 255 ? 255 : b < 0 ? 0 : b;
  return (usePound ? "#" : "") + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

export default PincodeCluster;
