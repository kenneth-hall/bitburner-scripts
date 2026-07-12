#!/usr/bin/env bash
# SessionStart hook: the Bitburner Remote API dev server (`npm run dev`,
# viteburner) survives the user's computer sleeping overnight, but its
# WebSocket connection to the game (port 12525) goes stale and doesn't
# cleanly reconnect -- exported logs silently stop updating even though the
# game/daemon itself recovers fine on wake. This checks connection freshness
# every session start and restarts the dev server if it's stale or missing.
#
# Scoped to the main bitburner-scripts checkout only -- never
# bitburner-scripts2 (worktree-docs), which must never touch npm run dev
# (see CLAUDE.md). This lives in .claude/settings.local.json (gitignored,
# per-worktree) so it never propagates there on its own, but the guard below
# is belt-and-suspenders in case that ever changes.
set -u

case "$PWD" in
  *bitburner-scripts2*) exit 0 ;;
esac

PROJECT_ROOT="C:/Users/admin/bitburner-scripts"
PROJECT_ROOT_WIN="C:\\Users\\admin\\bitburner-scripts"
LOG_FILE="$PROJECT_ROOT/logs/daemon-batch-log.json"
THRESHOLD=60

now=$(date +%s)
if [ -f "$LOG_FILE" ]; then
  mtime=$(date -r "$LOG_FILE" +%s 2>/dev/null || echo 0)
else
  mtime=0
fi
age=$(( now - mtime ))

# head -1 drops a stray diagnostic line ("ANOMALY: meaningless REX prefix
# used") that some PowerShell invocations emit on stdout past 2>/dev/null --
# without it, string comparison below silently breaks and every session
# start looks "not listening", forcing a needless restart.
listening=$(powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 12525 -State Listen -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }" 2>/dev/null | head -1 | tr -d '\r')

restart_dev_server() {
  powershell -NoProfile -Command "
    Get-NetTCPConnection -LocalPort 12525 -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c cd /d \"$PROJECT_ROOT_WIN\" && npm run dev' -WindowStyle Hidden
  " >/dev/null 2>&1
}

msgs=""

if [ "$listening" != "yes" ]; then
  restart_dev_server
  msgs="dev-server-autoheal: npm run dev wasn't running -- started it."
elif [ "$age" -gt "$THRESHOLD" ]; then
  restart_dev_server
  msgs="dev-server-autoheal: dev-server connection stale (last sync ${age}s ago) -- killed and restarted npm run dev."
fi

# Orphan-commit check: docs work committed to worktree-docs but never merged
# back to master strands off the branch (hit 2026-07-12 -- three doc commits
# sat unmerged until a manual sweep found them; see CLAUDE.md Worktrees). Run
# the same sweep every session start and nag if worktree-docs is ahead. This
# is a read-only git log -- worst case a spurious line, it can touch nothing.
orphans=$(git -C "$PROJECT_ROOT" log --oneline master..worktree-docs 2>/dev/null | wc -l | tr -d ' ')
if [ "${orphans:-0}" -gt 0 ] 2>/dev/null; then
  orphan_msg="worktree-orphan-check: worktree-docs has ${orphans} commit(s) not on master -- merge back to master before they strand (git merge worktree-docs)."
  if [ -n "$msgs" ]; then msgs="$msgs  ||  $orphan_msg"; else msgs="$orphan_msg"; fi
fi

if [ -n "$msgs" ]; then
  echo "{\"systemMessage\": \"$msgs\"}"
fi

exit 0
