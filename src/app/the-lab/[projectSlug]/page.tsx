import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { APP_ROUTES, VENUES, projectPath } from '@/config/venues';
import {
  getPublishedProjectBySlug,
  getPublishedProjectSitemapEntries,
} from '@/modules/projects';

import {
  type BreadcrumbItem,
  absoluteUrl,
  createBreadcrumbListJsonLd,
  createPageMetadata,
  createSoftwareSourceCodeJsonLd,
} from '@/lib/seo';

import { Breadcrumbs } from '@/components/Breadcrumbs';
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

  const metadata = createPageMetadata({
    title: project.seoTitle,
    description: project.seoDescription,
    path: projectPath(project.slug),
    image: {
      url: absoluteUrl(project.ogImage.src),
      width: project.ogImage.width,
      height: project.ogImage.height,
      alt: project.ogImage.alt,
    },
  });

  return {
    ...metadata,
    title: { absolute: project.seoTitle },
    openGraph: { ...metadata.openGraph, title: project.seoTitle },
    twitter: { ...metadata.twitter, title: project.seoTitle },
  };
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
  const breadcrumbs = [
    { href: APP_ROUTES.home, label: 'Home' },
    { href: VENUES.projects.path, label: VENUES.projects.label },
    { href: projectPath(project.slug), label: project.name },
  ] satisfies readonly BreadcrumbItem[];

  return (
    <>
      <JsonLd data={createSoftwareSourceCodeJsonLd({ project, url })} />
      <JsonLd data={createBreadcrumbListJsonLd(breadcrumbs)} />
      <Breadcrumbs items={breadcrumbs} />
      <ProjectArticle project={project} />
    </>
  );
}
