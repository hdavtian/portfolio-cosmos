import { useEffect, useRef, useState } from "react";
import "./CosmosLoader.scss";

interface CosmosLoaderProps {
  onLoadingComplete: () => void;
}

export default function CosmosLoader({ onLoadingComplete }: CosmosLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Initializing...");
  const timeoutsRef = useRef<number[]>([]);

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
    <div className="cosmos-loader">
      <div className="cosmos-loader__content">
        <div className="cosmos-loader__spectrum-shell">
          <div className="cosmos-loader__spectrum-logo">
            <span className="cosmos-loader__stripe cosmos-loader__stripe--1"></span>
            <span className="cosmos-loader__stripe cosmos-loader__stripe--2"></span>
            <span className="cosmos-loader__stripe cosmos-loader__stripe--3"></span>
            <span className="cosmos-loader__stripe cosmos-loader__stripe--4"></span>
            <span className="cosmos-loader__stripe cosmos-loader__stripe--5"></span>
            <span className="cosmos-loader__stripe cosmos-loader__stripe--6"></span>
          </div>
          <div className="cosmos-loader__bootline">SPECTRUM MODE</div>
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
