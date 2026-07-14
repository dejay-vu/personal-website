import Image from 'next/image';

import { type ProjectDetail, projectMetaLine } from '@/modules/projects/types';

// The canonical Project detail body. This is a spec sheet, not an article:
// mono section headers and typed fields rather than Markdown prose, so it
// deliberately skips the `.neon-prose` stack. Stays a Server Component so
// the whole sheet is present in the detail HTML.
export function ProjectArticle({ project }: { project: ProjectDetail }) {
  const specRows: [string, string][] = [
    ['version', project.version],
    ['language', project.language],
    ['interface', project.interfaceLabel],
    ['substrate', project.substrate],
    ['requires', project.requires],
    ['license', project.license],
  ];

  return (
    <article className="mx-auto w-full max-w-3xl pb-8">
      <header className="flex flex-col gap-4">
        <h1 data-project-title className="project-nameplate">
          {project.name}
        </h1>

        <p className="max-w-prose text-lg leading-8 text-foreground/90">
          {project.pitch}
        </p>

        <p className="project-meta">{projectMetaLine(project)}</p>

        <div className="flex flex-wrap gap-3">
          <a
            className="neon-ticket px-3 py-1"
            href={project.repoUrl}
            target="_blank"
            rel="noreferrer"
          >
            github ↗
          </a>
          <a
            className="neon-ticket px-3 py-1"
            href={project.packageUrl}
            target="_blank"
            rel="noreferrer"
          >
            pypi ↗
          </a>
        </div>
      </header>

      <section className="mt-12">
        <h2 className="project-section-title">Overview</h2>
        <div className="flex max-w-prose flex-col gap-4 pt-5">
          {project.overview.map((paragraph) => (
            <p
              key={paragraph.slice(0, 32)}
              className="text-[0.98rem] leading-8 text-foreground/85"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="project-section-title">Workflow</h2>
        <ol className="project-rail pt-5">
          {project.workflow.map((step, index) => (
            <li key={step.title} className="project-rail__step">
              <span aria-hidden="true" className="project-rail__index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <h3 className="project-rail__title">{step.title}</h3>
                <p className="pt-1 text-[0.9rem] leading-7 text-foreground/75">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="project-section-title">Console</h2>
        <figure className="pt-5">
          <div className="project-console">
            <Image
              src={project.screenshot.src}
              alt={project.screenshot.alt}
              width={project.screenshot.width}
              height={project.screenshot.height}
              unoptimized
              className="block h-auto w-full"
            />
          </div>
          {project.screenshot.caption && (
            <figcaption className="pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-(--neon-dim)/70">
              {project.screenshot.caption}
            </figcaption>
          )}
        </figure>
      </section>

      <section className="mt-12">
        <h2 className="project-section-title">Under the hood</h2>
        <div className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-3">
          {project.features.map((feature) => (
            <div key={feature.title} className="project-tile">
              <h3 className="text-[0.95rem] font-semibold text-(--neon-ink)">
                {feature.title}
              </h3>
              <p className="pt-2 text-[0.87rem] leading-7 text-foreground/70">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="project-section-title">Spec</h2>
        <div className="grid grid-cols-1 items-start gap-8 pt-5 md:grid-cols-2">
          <dl className="project-spec">
            {specRows.map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col items-start gap-4">
            <code className="project-spec__install">
              <span aria-hidden="true" className="text-(--neon-dim)">
                ${' '}
              </span>
              {project.installCommand}
            </code>
            <a
              className="project-link"
              href={project.repoUrl}
              target="_blank"
              rel="noreferrer"
            >
              source on github ↗
            </a>
          </div>
        </div>
      </section>
    </article>
  );
}
