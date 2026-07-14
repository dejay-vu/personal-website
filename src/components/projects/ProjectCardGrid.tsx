import type { ProjectListItem } from '@/modules/projects/types';

import { ProjectBenchSlot } from './ProjectBenchSlot';
import { ProjectCard } from './ProjectCard';

// The instrument grid. Two columns at most — the wide TUI window wants
// width — with a reserved bench trailing the live instruments.
export function ProjectCardGrid({ projects }: { projects: ProjectListItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-7 md:grid-cols-2 md:gap-x-5">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
      <ProjectBenchSlot />
    </div>
  );
}
