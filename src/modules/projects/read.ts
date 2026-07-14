import { PROJECTS } from './data';
import type { ProjectDetail, ProjectListItem } from './types';

// Unlike notes/photos, project content is compiled-in static data: there is
// no database read, so no `unstable_cache` layer and no cache tag to
// invalidate — pages that consume these reads are fully static. The async
// signatures mirror the other domain modules so a future persisted Project
// store can swap in behind the same seam.

function publishedProjects(): ProjectDetail[] {
  return PROJECTS.filter((project) => project.published).sort(
    (a, b) =>
      b.publishedAt.getTime() - a.publishedAt.getTime() ||
      b.id.localeCompare(a.id),
  );
}

// Explicit pick (the static analogue of `noteListSelect`) so detail-only
// fields never leak through list reads.
function toProjectListItem(project: ProjectDetail): ProjectListItem {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    pitch: project.pitch,
    abstract: project.abstract,
    version: project.version,
    language: project.language,
    interfaceLabel: project.interfaceLabel,
    license: project.license,
    stack: [...project.stack],
    repoUrl: project.repoUrl,
    packageUrl: project.packageUrl,
    screenshot: project.screenshot,
    published: project.published,
    publishedAt: project.publishedAt,
    updatedAt: project.updatedAt,
  };
}

export async function getPublishedProjects(): Promise<ProjectListItem[]> {
  return publishedProjects().map(toProjectListItem);
}

export async function getPublishedProjectBySlug(
  slug: string,
): Promise<ProjectDetail | null> {
  return publishedProjects().find((project) => project.slug === slug) ?? null;
}

export async function getPublishedProjectsCount(): Promise<number> {
  return publishedProjects().length;
}

export type ProjectSitemapEntry = Pick<
  ProjectListItem,
  'slug' | 'publishedAt' | 'updatedAt'
>;

export async function getPublishedProjectSitemapEntries(): Promise<
  ProjectSitemapEntry[]
> {
  return publishedProjects().map(({ slug, publishedAt, updatedAt }) => ({
    slug,
    publishedAt,
    updatedAt,
  }));
}
