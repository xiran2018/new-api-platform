# Platform content plugin

Implement the content plugin here using the upstream `Router -> Controller -> Service -> Model` convention.

Required API boundary:

- `GET /api/platform/public/faq` — published content only;
- `/api/platform/admin/content/*` — administrator-only CRUD, publish and unpublish.

Use a platform-owned database/schema and migrations. Do not add platform entities to new-api's core model migrations.
