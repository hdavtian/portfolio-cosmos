import React, { useState, useEffect, useRef } from "react";
import "./CosmicContentOverlay.scss";
import type { MoonPortfolioPayload } from "./cosmos/moonPortfolioSelector";

export interface JobTechEntry {
  label: string;
  highlightMatches: string[];
}

export interface OverlayContent {
  title: string;
  subtitle?: string;
  description: string;
  sections: OverlaySection[];
  jobTech?: JobTechEntry[];
  projects?: unknown[];
  moonPortfolio?: MoonPortfolioPayload | null;
  enableDroneCardDock?: boolean;
  media?: MediaContent;
  actions?: OverlayAction[];
}

export interface OverlaySection {
  id: string;
  title: string;
  content: string | string[];
  type: "text" | "timeline" | "skills" | "achievements" | "gallery";
  data?: any;
}

export interface MediaContent {
  type: "image" | "video" | "audio";
  url: string;
  caption?: string;
}

export interface OverlayAction {
  label: string;
  action: string;
  icon?: string;
}

interface CosmicContentOverlayProps {
  content: OverlayContent | null;
  isVisible: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
  position?: "center" | "right" | "left" | "bottom";
  animation?: "fade" | "slide" | "scale" | "cosmic";
}

export const CosmicContentOverlay: React.FC<CosmicContentOverlayProps> = ({
  content,
  isVisible,
  onClose,
  onAction,
  position = "center",
  animation = "cosmic",
}) => {
  const [activeSection, setActiveSection] = useState<string>("");
  const [isAnimating, setIsAnimating] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (content && content.sections.length > 0) {
      setActiveSection(content.sections[0].id);
    }
  }, [content]);

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 600);
    }
  }, [isVisible]);

  if (!content || !isVisible) return null;

  const getPositionClass = (): string => {
    switch (position) {
      case "right":
        return "overlay--right";
      case "left":
        return "overlay--left";
      case "bottom":
        return "overlay--bottom";
      default:
        return "overlay--center";
    }
  };

  const getAnimationClass = (): string => {
    return `overlay--${animation}${isAnimating ? " overlay--entering" : ""}`;
  };

  const renderSection = (section: OverlaySection): React.JSX.Element => {
    switch (section.type) {
      case "timeline":
        return renderTimelineSection(section);
      case "skills":
        return renderSkillsSection(section);
      case "achievements":
        return renderAchievementsSection(section);
      case "gallery":
        return renderGallerySection(section);
      default:
        return renderTextSection(section);
    }
  };

  const renderTextSection = (section: OverlaySection): React.JSX.Element => (
    <div className="section-content section-content--text">
      {Array.isArray(section.content) ? (
        section.content.map((paragraph, index) => (
          <p key={index} className="content-paragraph">
            {paragraph}
          </p>
        ))
      ) : (
        <div
          className="content-text"
          dangerouslySetInnerHTML={{ __html: section.content }}
        />
      )}
    </div>
  );

  const renderTimelineSection = (
    section: OverlaySection,
  ): React.JSX.Element => {
    const timelineData = section.data || [];

    return (
      <div className="section-content section-content--timeline">
        <div className="timeline">
          {timelineData.map((item: any, index: number) => (
            <div key={index} className="timeline-item">
              <div className="timeline-marker">
                <div className="timeline-dot"></div>
                {index < timelineData.length - 1 && (
                  <div className="timeline-line"></div>
                )}
              </div>
              <div className="timeline-content">
                <div className="timeline-date">{item.date}</div>
                <h4 className="timeline-title">{item.title}</h4>
                <p className="timeline-description">{item.description}</p>
                {item.technologies && (
                  <div className="timeline-technologies">
                    {item.technologies.map(
                      (tech: string, techIndex: number) => (
                        <span key={techIndex} className="tech-tag">
                          {tech}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSkillsSection = (section: OverlaySection): React.JSX.Element => {
    const skillsData = section.data || {};

    return (
      <div className="section-content section-content--skills">
        {Object.entries(skillsData).map(([category, skills]: [string, any]) => (
          <div key={category} className="skill-category">
            <h4 className="skill-category-title">{category}</h4>
            <div className="skills-grid">
              {skills.map((skill: any, index: number) => (
                <div key={index} className="skill-item">
                  <div className="skill-name">{skill.name || skill}</div>
                  {skill.level && (
                    <div className="skill-level">
                      <div
                        className="skill-progress"
                        style={{ width: `${skill.level}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAchievementsSection = (
    section: OverlaySection,
  ): React.JSX.Element => {
    const achievements = section.data || [];

    return (
      <div className="section-content section-content--achievements">
        <div className="achievements-grid">
          {achievements.map((achievement: any, index: number) => (
            <div key={index} className="achievement-card">
              <div className="achievement-icon">{achievement.icon || "🏆"}</div>
              <h4 className="achievement-title">{achievement.title}</h4>
              <p className="achievement-description">
                {achievement.description}
              </p>
              {achievement.metric && (
                <div className="achievement-metric">{achievement.metric}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGallerySection = (section: OverlaySection): React.JSX.Element => {
    const galleryItems = section.data || [];

    return (
      <div className="section-content section-content--gallery">
        <div className="gallery-grid">
          {galleryItems.map((item: any, index: number) => (
            <div key={index} className="gallery-item">
              <img
                src={item.url}
                alt={item.caption || ""}
                className="gallery-image"
              />
              {item.caption && (
                <p className="gallery-caption">{item.caption}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const activeContent = content.sections.find(
    (section) => section.id === activeSection,
  );

  return (
    <div
      ref={overlayRef}
      className={`cosmic-content-overlay ${getPositionClass()} ${getAnimationClass()}`}
    >
      {/* Background Backdrop */}
      <div className="overlay-backdrop" onClick={onClose}></div>

      {/* Main Content Container */}
      <div className="overlay-container">
        {/* Header */}
        <div className="overlay-header">
          <div className="header-content">
            <h2 className="overlay-title">{content.title}</h2>
            {content.subtitle && (
              <p className="overlay-subtitle">{content.subtitle}</p>
            )}
            <button className="close-button" onClick={onClose}>
              <span className="close-icon">✖</span>
            </button>
          </div>

          {/* Navigation Tabs */}
          {content.sections.length > 1 && (
            <div className="section-tabs">
              {content.sections.map((section) => (
                <button
                  key={section.id}
                  className={`section-tab ${activeSection === section.id ? "active" : ""}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="overlay-body">
          {/* Main Description */}
          <div className="main-description">
            <p>{content.description}</p>
          </div>

          {/* Media Content */}
          {content.media && (
            <div className="media-content">
              {content.media.type === "image" && (
                <img src={content.media.url} alt={content.media.caption} />
              )}
              {content.media.type === "video" && (
                <video controls>
                  <source src={content.media.url} type="video/mp4" />
                </video>
              )}
              {content.media.caption && (
                <p className="media-caption">{content.media.caption}</p>
              )}
            </div>
          )}

          {/* Active Section Content */}
          {activeContent && (
            <div className="section-wrapper">
              <h3 className="section-title">{activeContent.title}</h3>
              {renderSection(activeContent)}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {content.actions && content.actions.length > 0 && (
          <div className="overlay-footer">
            <div className="action-buttons">
              {content.actions.map((action, index) => (
                <button
                  key={index}
                  className="action-button"
                  onClick={() => onAction(action.action)}
                >
                  {action.icon && (
                    <span className="action-icon">{action.icon}</span>
                  )}
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cosmic Visual Effects */}
        <div className="cosmic-effects">
          <div className="star-particles"></div>
          <div className="energy-rings"></div>
        </div>
      </div>
    </div>
  );
};

export default CosmicContentOverlay;
