import Image from 'next/image';

import { projectPath } from '@/config/venues';
import {
  type ProjectListItem,
  projectMetaLine,
} from '@/modules/projects/types';

import { RouteLink } from '@/components/ui/RouteLink';

// Instrument card: a powered bench unit with its screen lit. The shop window
// holds the project's own UI capture; the nameplate switches to the display
// face — the one Lab-specific type move. Stack chips are non-interactive
// spans (they live inside the card anchor; there is nothing to filter).
export function ProjectCard({ project }: { project: ProjectListItem }) {
  return (
    <article className="neon-card min-w-0">
      <RouteLink
        href={projectPath(project.slug)}
        aria-label={project.name}
        progressLabel="Loading project"
        className="flex h-full flex-col p-3 outline-(--card-hue) focus-visible:outline-2 focus-visible:-outline-offset-2 sm:p-4"
      >
        <div className="neon-card__window shrink-0">
          <Image
            src={project.screenshot.src}
            alt={project.screenshot.alt}
            width={project.screenshot.width}
            height={project.screenshot.height}
            // Checked-in SVG served as-is from /public; the CloudFront
            // resizer pipeline is for MediaAsset originals only.
            unoptimized
            className="block h-auto w-full"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <p className="neon-card__meta">{projectMetaLine(project)}</p>

          <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2">
            <h2 className="neon-card__title neon-card__nameplate">
              {project.name}
            </h2>

            <p className="text-[0.95rem] leading-7 text-foreground/85">
              {project.abstract}
            </p>

            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              {project.stack.map((item) => (
                <span
                  key={item}
                  className="neon-ticket px-3 py-1 whitespace-nowrap"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </RouteLink>
    </article>
  );
}
