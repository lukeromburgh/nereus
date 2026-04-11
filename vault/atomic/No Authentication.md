# No Authentication

> [!danger] Severity: CRITICAL
> Zero authentication on all API endpoints. Any HTTP client can read, modify, or delete all data.

## What's Wrong

`backend/nereus_core/settings.py` has no authentication middleware, no user model in use, and no API token scheme. DRF defaults to `AllowAny` permissions.

Every endpoint is fully open:

```
DELETE /api/projects/1/     → deletes entire project tree
DELETE /api/assets/1/       → deletes uploaded geometry
PATCH  /api/runs/1/         → overwrites simulation results with fabricated data
GET    /api/runs/            → lists all simulations
```

### Compounding factor: Serializer bypass

The `SimulationRunSerializer.update()` method uses `self.initial_data` to allow the worker to set `status`, `current_logs`, `result_mesh_path`, etc. — bypassing DRF's `read_only_fields`. This means any HTTP client can PATCH a run to `COMPLETED` with fabricated metrics.

### Additional security issues

| Issue | Severity |
|-------|----------|
| `SECRET_KEY` hardcoded in `settings.py` | HIGH |
| `DEBUG = True` always | HIGH |
| `CORS_ALLOW_ALL_ORIGINS = True` | HIGH |
| No file content validation on uploads | MEDIUM |
| Unpinned pip dependencies | MEDIUM |

## Fix (MVP)

Add DRF `IsAuthenticated` + token auth. Even a single hardcoded API key is better than none:

```python
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.TokenAuthentication'],
}
```

## Fix (Proper)

Add user model, JWT auth (SimpleJWT), per-project ownership, and a service account token for the worker.

## References

- [[04 - Infrastructure, Security, Testing & Database Audit]] — OWASP Assessment
- [[Data Flow Walkthrough]] — Step 3
