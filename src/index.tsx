import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";

const rootEl = document.getElementById("root");

if (rootEl instanceof HTMLElement) {
  const root = createRoot(rootEl);
  root.render(<App />);
}
