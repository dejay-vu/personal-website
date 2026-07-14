import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { VENUES, projectPath } from '@/config/venues';
import {
  getPublishedProjectBySlug,
  getPublishedProjectSitemapEntries,
} from '@/modules/projects';

import {
  absoluteUrl,
  createPageMetadata,
  createSoftwareSourceCodeJsonLd,
} from '@/lib/seo';

import { JsonLd } from '@/components/JsonLd';
import { ProjectArticle } from '@/components/projects/project/ProjectArticle';

// Project content is compiled-in static data, so every slug is known at
// build time; unknown slugs 404 at the router without rendering.
export const dynamicParams = false;

export async function generateStaticParams() {
  const projects = await getPublishedProjectSitemapEntries();

  return projects.map(({ slug }) => ({ projectSlug: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}): Promise<Metadata | undefined> {
  const { projectSlug } = await params;
  const project = await getPublishedProjectBySlug(projectSlug);
  if (!project) notFound();

  return createPageMetadata({
    title: `${project.name} | ${VENUES.projects.label}`,
    description: project.pitch,
    path: projectPath(project.slug),
    // No per-project OG image: the screenshot is an SVG, which social
    // scrapers drop — the site's default 1200x630 raster applies.
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const project = await getPublishedProjectBySlug(projectSlug);
  // Unreachable while dynamicParams is false; kept so a future persisted
  // Project store can flip that flag without reintroducing this guard.
  if (!project) notFound();

  const url = absoluteUrl(projectPath(project.slug));

  return (
    <>
      <JsonLd data={createSoftwareSourceCodeJsonLd({ project, url })} />
      <ProjectArticle project={project} />
    </>
  );
}
