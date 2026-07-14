import { VENUES } from '@/config/venues';
import { getPublishedProjects } from '@/modules/projects';

import { ProjectCardGrid } from '@/components/projects';
import { HoloSign } from '@/components/ui';

export const dynamic = 'force-static';
// No `revalidate` (unlike notes/photos): project content is compiled-in
// static data, so it only changes with a deploy.

export default async function Page() {
  const projects = await getPublishedProjects();

  return (
    <div className="space-y-8">
      <HoloSign>{VENUES.projects.label}</HoloSign>
      <ProjectCardGrid projects={projects} />
    </div>
  );
}
