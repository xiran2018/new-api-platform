# Platform database

Platform-only data is stored in PostgreSQL database `platform_db`; it never uses the new-api database.

Default connection:

```text
postgresql://root:POSTGRES_PASSWORD@localhost:5432/platform_db?sslmode=disable
```

Set `PLATFORM_DATABASE_URL` in deployment to override this value. At first platform API access, the extension creates `platform_db` when it does not yet exist, then migrates only `update_entries` and `platform_settings`.
