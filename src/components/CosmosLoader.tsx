import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./CosmosLoader.scss";

interface CosmosLoaderProps {
  onLoadingComplete: () => void;
}

export default function CosmosLoader({ onLoadingComplete }: CosmosLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Initializing...");
  const timeoutsRef = useRef<number[]>([]);
  const signalClass =
    progress < 40
      ? "cosmos-loader--signal-pilot"
      : progress < 80
        ? "cosmos-loader--signal-header"
        : "cosmos-loader--signal-data";
  const revealStyle = {
    ["--reveal" as any]: `${progress}%`,
  } as CSSProperties;

  const queueTimeout = (fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timeoutsRef.current.push(id);
  };

  useEffect(() => {
    const stages = [
      { progress: 20, text: "Loading stellar textures...", delay: 200 },
      { progress: 40, text: "Generating orbital paths...", delay: 300 },
      { progress: 60, text: "Rendering planetary systems...", delay: 400 },
      { progress: 80, text: "Calibrating navigation...", delay: 300 },
      { progress: 100, text: "Ready for exploration", delay: 200 },
    ];

    let currentStage = 0;

    const advanceStage = () => {
      if (currentStage < stages.length) {
        const { progress: newProgress, text, delay } = stages[currentStage];
        setProgress(newProgress);
        setStage(text);
        currentStage++;

        queueTimeout(() => {
          if (currentStage < stages.length) {
            advanceStage();
          } else {
            // Final stage complete
            queueTimeout(onLoadingComplete, 300);
          }
        }, delay);
      }
    };

    // Start loading sequence
    queueTimeout(advanceStage, 100);

    return () => {
      timeoutsRef.current.forEach((id) => {
        window.clearTimeout(id);
      });
      timeoutsRef.current = [];
    };
  }, [onLoadingComplete]);

  return (
    <div className={`cosmos-loader ${signalClass}`}>
      <div className="cosmos-loader__signal" aria-hidden="true"></div>
      <div className="cosmos-loader__content">
        <div className="cosmos-loader__tv">
          <div className="cosmos-loader__tv-header">Program: Portfolio</div>
          <div className="cosmos-loader__tv-screen" style={revealStyle}>
            <div className="cosmos-loader__tv-base"></div>
            <div className="cosmos-loader__tv-image">
              <div className="cosmos-loader__tv-wordmark">HARMA DAVTIAN</div>
            </div>
            <div className="cosmos-loader__tv-scan"></div>
          </div>
        </div>

        <div className="cosmos-loader__text">
          <h2 className="cosmos-loader__title">HARMA DAVTIAN PORTFOLIO</h2>
          <p className="cosmos-loader__stage">{stage}</p>

          <div className="cosmos-loader__progress-grid" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => {
              const threshold = ((i + 1) / 24) * 100;
              return (
                <span
                  key={i}
                  className={`cosmos-loader__progress-cell ${
                    progress >= threshold ? "cosmos-loader__progress-cell--active" : ""
                  }`}
                />
              );
            })}
          </div>

          <div className="cosmos-loader__percentage">{progress}%</div>
        </div>
      </div>
    </div>
  );
}
