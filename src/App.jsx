import React from "react";
import ReactDOM from "react-dom";

import "leaflet/dist/leaflet.css";
import "./styles.css";
import PincodeMap from "./components/PincodeMap";
import pincodeSalesData from "./data/pincodeSales.json";

const App = () => {
  return (
    <div className="App">
      <h1 style={{ padding: "10px", margin: 0, backgroundColor: "#f0f0f0" }}>
        Pincode Sales Map Visualization
      </h1>
      <PincodeMap data={pincodeSalesData} />
    </div>
  );
};

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
