import React from "react";
import ReactDOM from "react-dom";

import "leaflet/dist/leaflet.css";
import "./styles.css";
import PincodeMap from "./components/PincodeMap";
import pincodeSalesData from "./data/pincodeSales.json";

const App = () => {
  return (
    <div className="App">
      <PincodeMap data={pincodeSalesData} />
    </div>
  );
};

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
