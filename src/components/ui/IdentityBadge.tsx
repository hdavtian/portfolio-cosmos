import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./IdentityBadge.scss";
import { SourceMarkedName } from "./SourceMarkedName";

interface Props {
  name: string;
  title: string;
}

const IdentityBadge: React.FC<Props> = ({ name, title }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="id-badge-stack">
      {/* Leaves the experience for the main site. Above the badge, so the title reveal (which grows downward) never moves it. */}
      <Link to="/" className="id-badge-exit">
        <span className="id-badge-exit__arrow" aria-hidden="true">
          ←
        </span>
        Back to main site
      </Link>
      <div
        className={`id-badge ${expanded ? "id-badge--expanded" : ""}`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div className="id-badge__name">
          <SourceMarkedName name={name} />
        </div>
        <div className="id-badge__detail">
          <div className="id-badge__title">{title}</div>
        </div>
      </div>
    </div>
  );
};

export default IdentityBadge;
