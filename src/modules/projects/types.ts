export type ProjectScreenshot = {
  /** Checked-in public asset path, e.g. `/projects/slurmdeck-tui.svg`. */
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Optional figcaption under the detail page's console rendering. */
  caption?: string;
};

export type ProjectListItem = {
  id: string;
  slug: string;
  name: string;
  /** One-line pitch shown on the home junction and the detail header. */
  pitch: string;
  /** Card paragraph on The Lab list page. */
  abstract: string;
  version: string;
  language: string;
  /** `interface` is a reserved word; this is the spec-sheet "interface" row. */
  interfaceLabel: string;
  license: string;
  stack: string[];
  repoUrl: string;
  packageUrl: string;
  screenshot: ProjectScreenshot;
  published: boolean;
  publishedAt: Date;
  updatedAt: Date;
};

export type ProjectWorkflowStep = {
  title: string;
  description: string;
};

export type ProjectFeature = {
  title: string;
  description: string;
};

export type ProjectDetail = ProjectListItem & {
  overview: string[];
  workflow: ProjectWorkflowStep[];
  features: ProjectFeature[];
  substrate: string;
  requires: string;
  installCommand: string;
};

/** The mono meta line, shared by the list card and the detail header. */
export function projectMetaLine(
  project: Pick<
    ProjectListItem,
    'language' | 'interfaceLabel' | 'version' | 'license'
  >,
) {
  return [
    project.language,
    project.interfaceLabel,
    `v${project.version}`,
    project.license,
  ]
    .join(' · ')
    .toUpperCase();
}
