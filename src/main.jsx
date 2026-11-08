import React from "react";
import { createRoot } from "react-dom/client";
import { LiveApp } from "./LiveApp.jsx";
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
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>{import.meta.env.DEV ? <App /> : <LiveApp />}</ErrorBoundary>,
);
