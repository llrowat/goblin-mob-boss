import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// StrictMode is intentionally omitted. It double-mounts components in dev,
// which causes duplicate PTY event listeners and terminal output.
// xterm.js + Tauri events are not compatible with StrictMode's mount cycle.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
