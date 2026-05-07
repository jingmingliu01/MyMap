import { useMemo, type CSSProperties } from "react";
import type { MapPoint } from "../../src/shared/schema";
import { colorForGroup } from "../lib/colors";

type ChipStyle = CSSProperties & {
  "--chip-color"?: string;
};

export function GroupFilter({
  points,
  activeGroup,
  onSelect
}: {
  points: MapPoint[];
  activeGroup: string | null;
  onSelect: (groupName: string | null) => void;
}) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, { name: string; type: string; color: string; count: number }>();
    for (const point of points) {
      const current = byGroup.get(point.group_name);
      if (current) {
        current.count += 1;
      } else {
        byGroup.set(point.group_name, {
          name: point.group_name,
          type: point.group_type,
          color: colorForGroup(point),
          count: 1
        });
      }
    }
    return Array.from(byGroup.values());
  }, [points]);

  return (
    <nav id="group-filter" aria-label="地图地点组筛选">
      <button className={`group-chip ${activeGroup ? "" : "active"}`} type="button" aria-pressed={!activeGroup} onClick={() => onSelect(null)}>
        <span className="group-chip-dot all" />
        <span className="group-chip-label">全部地点</span>
        <span className="group-chip-count">{points.length}</span>
      </button>
      {groups.map((group) => {
        const isActive = activeGroup === group.name;
        return (
          <button
            className={`group-chip ${isActive ? "active" : ""}`}
            type="button"
            aria-pressed={isActive}
            style={{ "--chip-color": group.color } as ChipStyle}
            key={group.name}
            onClick={() => onSelect(isActive ? null : group.name)}
          >
            <span className="group-chip-dot" />
            <span className="group-chip-label">{group.name}</span>
            <span className="group-chip-count">{group.count}</span>
          </button>
        );
      })}
    </nav>
  );
}
