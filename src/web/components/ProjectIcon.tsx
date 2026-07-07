import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import type { ProjectNode } from "../../shared/api-types.ts";
import { FrameworkIcon } from "./FrameworkIcon.tsx";

// Custom icon (site favicon, GitHub avatar, or upload) with a graceful chain
// of fallbacks: broken image -> framework mark -> folder. Custom icons render
// as full tiles; brand marks as glyphs.
const SIZES = {
  /** Row scale: palette results, list rows. */
  sm: { img: "size-4 rounded-sm", mark: "size-4", folder: "size-4" },
  /** Card scale: the projects overview. */
  md: { img: "size-8 rounded-md", mark: "size-6", folder: "size-5" },
} as const;

export function ProjectIcon({
  project,
  size = "md",
}: {
  project: Pick<ProjectNode, "icon" | "framework">;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [project.icon]);

  if (project.icon && !broken) {
    return (
      <img
        src={project.icon}
        alt=""
        className={s.img}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  if (project.framework) {
    return <FrameworkIcon framework={project.framework} className={s.mark} />;
  }
  return <Folder className={`text-muted-foreground ${s.folder}`} />;
}
