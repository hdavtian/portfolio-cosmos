import React, { useState } from "react";
import "./IdentityBadge.scss";

interface Props {
  name: string;
  title: string;
}

const IdentityBadge: React.FC<Props> = ({ name, title }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`id-badge ${expanded ? "id-badge--expanded" : ""}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="id-badge__name">{name}</div>
      <div className="id-badge__detail">
        <div className="id-badge__title">{title}</div>
      </div>
    </div>
  );
};

export default IdentityBadge;
