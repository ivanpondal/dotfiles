#!/bin/sh
set -eu

eval "$(jq -r '
  def human:
    if . >= 1000000 then ((. / 1000000 * 10 | round) / 10 | tostring) + "M"
    elif . >= 1000 then ((. / 1000) | round | tostring) + "k"
    else tostring end;
  @sh "cwd=\(.workspace.current_dir // "")",
  @sh "model=\(.model.display_name // "?")",
  @sh "effort=\(.effort.level // "")",
  @sh "pct=\(.context_window.used_percentage // 0 | round)",
  @sh "used=\(.context_window.total_input_tokens // 0 | human)",
  @sh "size=\(.context_window.context_window_size // 0 | human)"
')"

dir=${cwd##*/}

branch=$(git -C "$cwd" symbolic-ref --quiet --short HEAD 2>/dev/null) ||
    branch=$(git -C "$cwd" rev-parse --short HEAD 2>/dev/null) ||
    branch=""

filled=$((pct * 8 / 100))
bar=""
i=0
while [ "$i" -lt 8 ]; do
    [ "$i" -lt "$filled" ] && bar="${bar}▓" || bar="${bar}░"
    i=$((i + 1))
done

e=$(printf '\033')

out="$dir"
[ -n "$branch" ] && out="${out} ${branch}"
out="${out} | ${model}"
[ -n "$effort" ] && out="${out} · ${effort}"
out="${out} · ${bar} ${pct}% (${used}/${size})"

printf '%s[2m%s%s[0m' "$e" "$out" "$e"
