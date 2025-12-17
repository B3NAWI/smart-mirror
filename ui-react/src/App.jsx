import { useState } from "react";
import IntroScreen from "./components/IntroScreen";
import Dashboard from "./Dashboard";
import ErrorBoundary from "./ErrorBoundary";

export default function App() {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <ErrorBoundary>
      {showIntro ? (
        <IntroScreen onFinish={() => setShowIntro(false)} />
      ) : (
        <Dashboard />
      )}
    </ErrorBoundary>
  );
}
