import { useEffect, useState } from "react";
import "./CosmosLoader.scss";

interface CosmosLoaderProps {
  onLoadingComplete: () => void;
}

export default function CosmosLoader({ onLoadingComplete }: CosmosLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Initializing...");

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

        setTimeout(() => {
          if (currentStage < stages.length) {
            advanceStage();
          } else {
            // Final stage complete
            setTimeout(onLoadingComplete, 300);
          }
        }, delay);
      }
    };

    // Start loading sequence
    setTimeout(advanceStage, 100);
  }, [onLoadingComplete]);

  return (
    <div className="cosmos-loader">
      <div className="cosmos-loader__content">
        <div className="cosmos-loader__orbit">
          <div className="cosmos-loader__planet"></div>
          <div className="cosmos-loader__moon"></div>
        </div>

        <div className="cosmos-loader__text">
          <h2 className="cosmos-loader__title">HARMA DAVTIAN JOURNEY</h2>
          <p className="cosmos-loader__stage">{stage}</p>

          <div className="cosmos-loader__progress-bar">
            <div
              className="cosmos-loader__progress-fill"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <div className="cosmos-loader__percentage">{progress}%</div>
        </div>
      </div>

      <div className="cosmos-loader__stars">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="cosmos-loader__star"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }}
          ></div>
        ))}
      </div>
    </div>
  );
}
