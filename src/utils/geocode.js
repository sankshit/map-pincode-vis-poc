// Utility to geocode pincodes to coordinates
// This uses a free geocoding service for Indian pincodes
// You can replace this with your own geocoding service or API

// Sample mapping for some common Indian pincodes (you can expand this)
const pincodeCoordinates = {
  "110001": [28.6139, 77.2090], // New Delhi
  "400001": [18.9388, 72.8354], // Mumbai
  "560001": [12.9716, 77.5946], // Bangalore
  "700001": [22.5448, 88.3426], // Kolkata
  "110002": [28.6139, 78.2090], // New Delhi
  "600001": [13.0827, 80.2707], // Chennai
  "380001": [23.0225, 72.5714], // Ahmedabad
  "400002": [18.9388, 72.8354], // Mumbai
  "560002": [12.9716, 77.5946], // Bangalore
  "700002": [22.5448, 88.3426], // Kolkata
  "600002": [13.0827, 80.2707], // Chennai
  "380002": [23.0225, 72.5714], // Ahmedabad
};

const memoryCache = new Map();
const STORAGE_KEY = "pincodeCoordinateCache_v1";

const readStorageCache = () => {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    return {};
  }
};

const writeStorageCache = (cache) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    // Ignore storage failures (quota / privacy mode)
  }
};

const getCachedCoordinates = (pincode) => {
  if (memoryCache.has(pincode)) {
    return memoryCache.get(pincode);
  }
  const storageCache = readStorageCache();
  if (storageCache[pincode]) {
    memoryCache.set(pincode, storageCache[pincode]);
    return storageCache[pincode];
  }
  return null;
};

const setCachedCoordinates = (pincode, coords) => {
  memoryCache.set(pincode, coords);
  const storageCache = readStorageCache();
  storageCache[pincode] = coords;
  writeStorageCache(storageCache);
};

/**
 * Geocode a pincode to coordinates
 * @param {string} pincode - The pincode to geocode
 * @returns {Promise<[number, number]>} - [latitude, longitude]
 */
export const geocodePincode = async (pincode) => {
  const cached = getCachedCoordinates(pincode);
  if (cached) {
    return cached;
  }

  // Check if we have coordinates in our mapping
  if (pincodeCoordinates[pincode]) {
    setCachedCoordinates(pincode, pincodeCoordinates[pincode]);
    return pincodeCoordinates[pincode];
  }

  // For Indian pincodes, you can use a geocoding API
  // Example using a free service (you may need to replace with your own API)
  try {
    // Using Nominatim (OpenStreetMap) geocoding - free but rate-limited
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${pincode}&country=India&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'MapChartApp/1.0'
        }
      }
    );
    
    const data = await response.json();
    if (data && data.length > 0) {
      const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      setCachedCoordinates(pincode, coords);
      return coords;
    }
  } catch (error) {
    console.warn(`Failed to geocode pincode ${pincode}:`, error);
  }

  // Fallback: return null if geocoding fails
  return null;
};

/**
 * Geocode multiple pincodes
 * @param {Array<string>} pincodes - Array of pincodes
 * @returns {Promise<Object>} - Object mapping pincode to coordinates
 */
export const geocodePincodes = async (pincodes) => {
  const results = {};
  
  // Process in batches to avoid rate limiting
  for (let i = 0; i < pincodes.length; i++) {
    const pincode = pincodes[i];
    const coords = await geocodePincode(pincode);
    if (coords) {
      results[pincode] = coords;
    }
    
    // Add delay to avoid rate limiting (500ms between requests)
    if (i < pincodes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
};
