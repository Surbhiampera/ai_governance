// Auto-generated org/project ids carry a trailing epoch-timestamp suffix
// (e.g. "mock_interview_agent_1782469816871"). Some seeded/test records never
// got a separate clean name, so their "name" field is literally the id. This
// strips that suffix so raw ids never leak into the UI, without touching the
// real id used for filtering/API calls.
export function displayName(name) {
  if (!name) return name;
  return String(name).replace(/_\d{9,}$/, "");
}

export function orgLabel(org, fallback = "—") {
  if (!org) return fallback;
  return displayName(org.org_name) || displayName(org.org_id || org.id) || fallback;
}

export function projectLabel(project, fallback = "—") {
  if (!project) return fallback;
  return displayName(project.project_name) || displayName(project.project_id || project.id) || fallback;
}
