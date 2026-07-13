---
status: accepted
---

# Stable domain names and storage identity

The public brands Darkroom, Field Notes, and The Lab may evolve, so the active domain language is Photo/photos, Note/notes, and Project/projects. Public brand names and paths stop at presentation adapters; PostgreSQL models, modules, endpoints, cache tags, and audit targets use stable domain nouns. Project/projects is reserved until The Lab gains persisted behavior.

Note Markdown and metadata are stored atomically in PostgreSQL. S3 stores binary media only, under immutable keys derived from entity and Media Asset IDs rather than slugs, titles, venue names, paths, or source filenames. Archiving retains storage; purging queues persistent, retryable deletion work.

Because the site was unpublished during the cutover, no redirects, dual reads, aliases, or other compatibility paths were retained. Legacy collection paths and endpoints return 404. Changing an item Slug makes the old locator return 404 while the entity ID and Media Asset keys remain unchanged.
