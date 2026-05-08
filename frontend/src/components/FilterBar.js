import React, { useEffect, useState } from "react";
import { getTracingOrgs, getTracingProjects } from "../api";
import { RANGE_OPTIONS } from "../utils/filters";

/**
 * Reusable filter bar with Organization, Project, and Time-range dropdowns.
 *
 * Props:
 *   range          — current range value (e.g. "all", "today", "7d", "30d", "90d")
 *   onRangeChange  — (newRange) => void
 *   orgId          — current org id ("" for All)
 *   onOrgChange    — (newOrgId) => void   (also clears project)
 *   projectId      — current project id ("" for All)
 *   onProjectChange — (newProjectId) => void
 *   showOrg        — bool, default true
 *   showProject    — bool, default true
 *   showRange      — bool, default true
 *   compact        — bool, render inline instead of full panel
 *   extra          — optional ReactNode rendered after the dropdowns
 */
export default function FilterBar({
  range = "all",
  onRangeChange,
  orgId = "",
  onOrgChange,
  projectId = "",
  onProjectChange,
  showOrg = true,
  showProject = true,
  showRange = true,
  compact = false,
  extra = null,
}) {
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (!showOrg && !showProject) return;
    getTracingOrgs()
      .then((res) => setOrgs(res.data || []))
      .catch(() => setOrgs([]));
  }, [showOrg, showProject]);

  useEffect(() => {
    if (!showProject) return;
    if (!orgId) {
      setProjects([]);
      return;
    }
    getTracingProjects(orgId)
      .then((res) => setProjects(res.data || []))
      .catch(() => setProjects([]));
  }, [orgId, showProject]);

  const wrapperStyle = compact
    ? {
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
      }
    : {
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        padding: "10px 14px",
        background: "var(--surface-2, #f8f9fa)",
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 8,
      };

  const selectStyle = {
    fontSize: 13,
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid var(--border, #ddd)",
    background: "#fff",
    minWidth: 160,
  };

  return (
    <div style={wrapperStyle}>
      {showOrg && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ color: "var(--gray-500)" }}>Organization</span>
          <select
            value={orgId}
            onChange={(e) => {
              const newOrg = e.target.value;
              if (onOrgChange) onOrgChange(newOrg);
              // Reset project whenever org changes
              if (onProjectChange) onProjectChange("");
            }}
            style={selectStyle}
          >
            <option value="">All organizations</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label || o.name || o.id}
              </option>
            ))}
          </select>
        </label>
      )}

      {showProject && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ color: "var(--gray-500)" }}>Project</span>
          <select
            value={projectId}
            onChange={(e) => onProjectChange && onProjectChange(e.target.value)}
            disabled={!orgId}
            style={{ ...selectStyle, opacity: orgId ? 1 : 0.5 }}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label || p.name || p.id}
              </option>
            ))}
          </select>
        </label>
      )}

      {showRange && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ color: "var(--gray-500)" }}>Range</span>
          <select
            value={range}
            onChange={(e) => onRangeChange && onRangeChange(e.target.value)}
            style={selectStyle}
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {extra}
    </div>
  );
}
