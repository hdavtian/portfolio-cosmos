import { useEffect, useState, useRef } from "react";
import resumeData from "../data/resume.json";

interface ScrollControllerProps {
  onSectionChange: (section: string, subIndex?: number) => void;
}

const SECTIONS = ["hero", "summary", "skills", "experience", "footer"];

const ScrollController = ({ onSectionChange }: ScrollControllerProps) => {
  const [currentSection, setCurrentSection] = useState(0);
  const [currentJob, setCurrentJob] = useState(0);
  const totalJobs = resumeData.experience.length;
  const isNavigating = useRef(false);
  const currentSectionRef = useRef(0);
  const currentJobRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => {
    currentSectionRef.current = currentSection;
    currentJobRef.current = currentJob;
  }, [currentSection, currentJob]);

  // Initialize hero as active on mount
  useEffect(() => {
    onSectionChange("hero");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = (direction: "up" | "down") => {
    const section = currentSectionRef.current;
    const job = currentJobRef.current;

    if (direction === "down") {
      // If in experience section, navigate through jobs first
      if (SECTIONS[section] === "experience") {
        if (job < totalJobs - 1) {
          const nextJob = job + 1;
          setCurrentJob(nextJob);
          onSectionChange("experience", nextJob);
          return;
        }
      }

      // Move to next section
      if (section < SECTIONS.length - 1) {
        const nextSection = section + 1;
        setCurrentSection(nextSection);
        setCurrentJob(0);
        onSectionChange(SECTIONS[nextSection], 0);
      }
    } else {
      // Arrow Up
      // If in experience section and not on first job, go back through jobs
      if (SECTIONS[section] === "experience" && job > 0) {
        const nextJob = job - 1;
        setCurrentJob(nextJob);
        onSectionChange("experience", nextJob);
        return;
      }

      // Move to previous section
      if (section > 0) {
        const nextSection = section - 1;
        setCurrentSection(nextSection);

        // If going back to experience, show last job
        if (SECTIONS[nextSection] === "experience") {
          setCurrentJob(totalJobs - 1);
          onSectionChange(SECTIONS[nextSection], totalJobs - 1);
        } else {
          setCurrentJob(0);
          onSectionChange(SECTIONS[nextSection], 0);
        }
      }
    }
  };

  useEffect(() => {
    let keyDebounceTimeout: ReturnType<typeof setTimeout>;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();

        // Debounce: prevent rapid key presses
        if (isNavigating.current) return;
        isNavigating.current = true;

        clearTimeout(keyDebounceTimeout);
        keyDebounceTimeout = setTimeout(() => {
          isNavigating.current = false;
        }, 300);

        navigate(e.key === "ArrowDown" ? "down" : "up");
      }
    };

    // Handle wheel scrolling with debounce
    let scrollTimeout: ReturnType<typeof setTimeout>;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (isNavigating.current) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isNavigating.current = true;

        navigate(e.deltaY > 0 ? "down" : "up");

        setTimeout(() => {
          isNavigating.current = false;
        }, 300);
      }, 50);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
      clearTimeout(scrollTimeout);
      clearTimeout(keyDebounceTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default ScrollController;
