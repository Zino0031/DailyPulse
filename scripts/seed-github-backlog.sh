#!/usr/bin/env bash
# Seed the GitHub backlog: labels + issues from .github/backlog.json
# Prerequisites:
#   - GitHub repo exists (e.g. Zino0031/dailypulse)
#   - A classic PAT with `repo` + `project` scopes, or fine-grained Issues:write + Projects:write
# Usage:
#   GH_TOKEN=ghp_xxx GH_REPO=Zino0031/dailypulse bash scripts/seed-github-backlog.sh
#   DRY_RUN=1 bash scripts/seed-github-backlog.sh   # preview without creating
set -euo pipefail

GH_REPO="${GH_REPO:-Zino0031/dailypulse}"
BACKLOG=".github/backlog.json"
API="https://api.github.com"

if [[ -z "${GH_TOKEN:-}" && "${DRY_RUN:-}" != "1" ]]; then
  echo "Missing GH_TOKEN. Export it first:" >&2
  echo "  GH_TOKEN=ghp_xxx GH_REPO=$GH_REPO bash scripts/seed-github-backlog.sh" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (sudo apt install jq / brew install jq)" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

auth=(-H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
if [[ -n "${GH_TOKEN:-}" ]]; then auth+=(-H "Authorization: Bearer $GH_TOKEN"); fi

echo "== $GH_REPO: ensuring labels =="
# Labels used in backlog.json (colors are cosmetic)
declare -A LABEL_COLORS=(
  ["type:feature"]="0e8a16" ["type:task"]="fbca04" ["type:bug"]="d73a4a"
  ["epic:setup"]="1d76db" ["epic:auth"]="1d76db" ["epic:avatar"]="1d76db"
  ["epic:closet"]="1d76db" ["epic:context"]="1d76db" ["epic:ai-composer"]="5319e7"
  ["epic:subscriptions"]="5319e7" ["epic:infra"]="5319e7"
  ["priority:high"]="b60205" ["priority:medium"]="d93f0b" ["priority:low"]="0e8a16"
  ["good first issue"]="7057ff"
)
for label in "${!LABEL_COLORS[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${auth[@]}" -X POST "$API/repos/$GH_REPO/labels" \
    -d "$(jq -n --arg n "$label" --arg c "${LABEL_COLORS[$label]}" '{name:$n,color:$c}')" || true)
  # 201 created, 422 already exists — both fine
  echo "  label '$label' -> $code"
done

echo "== creating issues from $BACKLOG =="
count=$(jq 'length' "$BACKLOG")
for i in $(seq 0 $((count - 1))); do
  title=$(jq -r ".[$i].title" "$BACKLOG")
  body=$(jq -r ".[$i].body" "$BACKLOG")
  labels_json=$(jq -c ".[$i].labels" "$BACKLOG")
  echo "--- [$((i + 1))/$count] $title"
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "  (dry run) labels=$labels_json"
    continue
  fi
  payload=$(jq -n --arg t "$title" --arg b "$body" --argjson l "$labels_json" '{title:$t,body:$b,labels:$l}')
  resp=$(curl -s "${auth[@]}" -X POST "$API/repos/$GH_REPO/issues" -d "$payload")
  url=$(echo "$resp" | jq -r '.html_url // empty')
  if [[ -n "$url" ]]; then
    echo "  created: $url"
  else
    echo "  FAILED:"; echo "$resp" | jq -c '{message, errors}' || echo "$resp"
  fi
  sleep 1 # stay under secondary rate limits
done

echo
echo "Next: create the board once at https://github.com/$GH_REPO/projects/new"
echo "(Table/Board layout, Status field: Todo, In Progress, In Review, Done),"
echo "then add repo secret PROJECT_URL + ADD_TO_PROJECT_PAT per .github/workflows/add-to-project.yml"
