import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/app.css";

const body = document.body;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App
      routeConfig={{
        uiLanguage: body.dataset.routeUiLanguage || "en",
        contentLanguage: body.dataset.routeContentLanguage || "en",
        previewLanguage: body.dataset.routePreviewLanguage || "en",
        mode: body.dataset.routeMode || "resume"
      }}
    />
  </React.StrictMode>
);
