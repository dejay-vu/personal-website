import type { ProjectDetail } from './types';

// The Lab's static catalogue. Projects change a few times a year, so content
// ships as code: edit this file, commit, deploy. Dates are fixed constants —
// never `new Date()` — so sitemap lastmod and JSON-LD output stay
// deterministic across builds.
export const PROJECTS: ProjectDetail[] = [
  {
    id: 'slurmdeck',
    slug: 'slurmdeck',
    name: 'SlurmDeck',
    pitch:
      'A local command-line tool and terminal UI for running code on a remote Slurm cluster.',
    abstract:
      'Keep editing locally; SlurmDeck snapshots the exact files a run needs, ships them over SSH, submits a command or parameter sweep, merges Slurm and per-task status, follows logs, and pulls results back — a reproducible replacement for hand-assembled rsync, sbatch, squeue, and sacct loops.',
    version: '0.1.0',
    language: 'Python',
    interfaceLabel: 'CLI + TUI',
    license: 'MIT',
    stack: ['python', 'ssh', 'slurm', 'tui', 'sqlite'],
    repoUrl: 'https://github.com/dejay-vu/slurmdeck',
    packageUrl: 'https://pypi.org/project/slurmdeck/',
    screenshot: {
      src: '/assets/slurmdeck-tui.svg',
      width: 2068,
      height: 758,
      alt: 'SlurmDeck terminal UI showing the wide Runs screen in the dark theme',
      caption: 'slurmdeck ui — runs / environments / remotes · keys 1 / 2 / 3',
    },
    published: true,
    publishedAt: new Date('2026-07-14T00:00:00.000Z'),
    updatedAt: new Date('2026-07-14T00:00:00.000Z'),
    overview: [
      'Running code on an HPC cluster usually means assembling the same loop by hand: rsync the project over, sbatch a script, poll squeue and sacct, tail logs over SSH, then copy results back. SlurmDeck folds that loop into one tool that works with the cluster’s existing accounts, partitions, and policies — nothing is installed on the cluster, and the login node only needs Python 3.8+ with the Slurm client commands.',
      'Every run is immutable: planned and validated in memory, then committed atomically to the local run directory and SQLite database. Snapshots are content-hashed and upload once. Environments are managed conda builds with immutable generations or a user-owned prefix, and every command can emit a machine-readable JSON envelope for automation.',
    ],
    workflow: [
      {
        title: 'register',
        description:
          'Add a cluster once by SSH destination or alias; SlurmDeck verifies Python and the Slurm client commands on the login node.',
      },
      {
        title: 'snapshot',
        description:
          'Sync rules capture the exact files a run needs as a content-hashed, immutable snapshot — previewed before anything uploads.',
      },
      {
        title: 'submit',
        description:
          'Plan a command or parameter sweep, review the materialized run, then submit it atomically; a retry is a new run, never a mutation.',
      },
      {
        title: 'monitor',
        description:
          'One status view merges live scheduler observations, per-task artifacts, and local lifecycle state; logs follow as they stream.',
      },
      {
        title: 'fetch',
        description:
          'Pull results back into the local project with one command; the snapshot and receipts keep the run reproducible after the fact.',
      },
    ],
    features: [
      {
        title: 'Atomic submissions',
        description:
          'Runs are validated in memory and committed atomically — an interrupted submit leaves nothing half-landed on the cluster.',
      },
      {
        title: 'Immutable environments',
        description:
          'Managed conda environments build in numbered, immutable generations with explicit garbage collection and recovery.',
      },
      {
        title: 'Sweeps & automation',
        description:
          'Parameter matrices with exclude rules and {config}, {output}, {task_id} placeholders; every command speaks JSON for scripting.',
      },
    ],
    substrate: 'Slurm over SSH',
    requires:
      'Local: POSIX, Python 3.11+, git, OpenSSH, rsync · Cluster: Python 3.8+ and Slurm client commands',
    installCommand: 'pipx install slurmdeck',
  },
];
