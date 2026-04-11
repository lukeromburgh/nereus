# Hardcoded API URLs

> [!warning] Severity: HIGH
> `http://localhost:8000` is hardcoded in 7+ frontend files. Production deployment will break without refactoring.

## Affected Files

| File | Usage |
|------|-------|
| `App.tsx` | Polling: `GET /api/runs/{id}/`, `GET /api/runs/{id}/analysis/` |
| `ConfigPanel.tsx` | Submit: `POST /api/runs/` |
| `Sidebar.tsx` | Listing: `GET /api/runs/`, folder tree |
| `TopNavbar.tsx` | Project context |
| `RunComparisonPage.tsx` | Multi-run fetch |
| `LogConsole.tsx` | Log fetch |
| `AnalysisPanel.tsx` | Analysis fetch |

Only `assetApi.ts` centralises its base URL — but that's also hardcoded to `localhost:8000`.

## Impact

- Cannot deploy frontend and backend on different hosts
- Cannot run behind a reverse proxy without rewriting all files
- Environment-specific builds require source changes

## Fix

Create a single API client with configurable base URL:

```typescript
// lib/apiClient.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});
```

All components import `api` instead of constructing URLs. The Vite env var is set per environment, and the default `/api` works behind a reverse proxy.

## References

- [[02 - User Journey & UX Audit]] — Cross-Cutting Issues
- [[03 - Frontend & UI Audit]] — Architecture
- [[Data Flow Walkthrough]] — Steps 1, 6
