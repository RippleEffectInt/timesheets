import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main>
        <h1>Timesheets could not load</h1>
        <p>
          Please reload the page. If the problem continues, contact your
          administrator.
        </p>
      </main>
    ) : (
      this.props.children
    );
  }
}
// The existing registered root URL also acts as the MSAL v5 iframe bridge.
// Never initialise the application or call its API inside the silent callback frame.
if (window.parent !== window) {
  import("@azure/msal-browser/redirect-bridge")
    .then(({broadcastResponseToMainFrame}) => broadcastResponseToMainFrame())
    .catch(() => { document.getElementById("root").textContent = "Sign-in could not complete. Return to the main window."; });
} else {
  const render = Component => createRoot(document.getElementById("root")).render(<ErrorBoundary><Component /></ErrorBoundary>);
  if(import.meta.env.DEV) render(App);
  else import("./LiveApp.jsx").then(({LiveApp})=>render(LiveApp)).catch(()=>{
    document.getElementById("root").textContent="Timesheets could not load. Please reload.";
  });
}
