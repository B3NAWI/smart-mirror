import { useEffect } from "react";
import "./IntroScreen.css";

const DURATION = 6000;

export default function IntroScreen({ onFinish }) {
  useEffect(() => {
    const timer = setTimeout(onFinish, DURATION);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="intro-container">
      <img
        src="/png/halo-logo2.png"
        alt="HALO MIRROR"
        className="intro-logo"
      />

      <div className="intro-text">
        <div className="intro-title">Welcome to HALO MIRROR</div>
        <div className="intro-subtitle">Your smart ambient companion</div>
      </div>
    </div>
  );
}
