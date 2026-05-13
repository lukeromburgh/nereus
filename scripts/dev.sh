#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

POSTGRES_USER="${POSTGRES_USER:-nereus_admin}"
POSTGRES_DB="${POSTGRES_DB:-nereus}"
BUILD_STATE_FILE="$ROOT_DIR/.flow-build-state"

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

usage() {
  cat <<'EOF'
Usage: ./flow [start|init|down|logs|help] [--build]

Commands:
  start   Start Docker services and the Vite frontend (default)
  init    First-time setup, including migrations and superuser creation
  down    Stop Docker services
  logs    Tail API and worker logs
  help    Show this message

Examples:
  ./flow
  ./flow init
  ./flow start --build
  npm run flow -- help
EOF
}

ensure_env_files() {
  if [[ ! -f backend/.env ]]; then
    echo "Missing backend/.env. Copy backend/.env.example first." >&2
    exit 1
  fi

  if [[ ! -f frontend/.env ]]; then
    echo "Missing frontend/.env. Copy frontend/.env.example first." >&2
    exit 1
  fi
}

wait_for_postgres() {
  local attempts=60

  until docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    attempts=$((attempts - 1))
    if [[ "$attempts" -le 0 ]]; then
      echo "Postgres did not become ready in time." >&2
      exit 1
    fi

    echo "Waiting for Postgres..."
    sleep 1
  done
}

ensure_frontend_dependencies() {
  if [[ ! -d frontend/node_modules ]]; then
    echo "Installing frontend dependencies..."
    npm --prefix frontend install
  fi
}

build_signature() {
  shasum \
    backend/Dockerfile \
    backend/requirements.txt \
    simulation_worker/Dockerfile \
    | shasum \
    | awk '{print $1}'
}

ensure_service_images() {
  local force_build="${1:-false}"
  local current_signature
  local previous_signature=""

  current_signature="$(build_signature)"
  if [[ -f "$BUILD_STATE_FILE" ]]; then
    previous_signature="$(<"$BUILD_STATE_FILE")"
  fi

  if [[ "$force_build" == "true" || "$current_signature" != "$previous_signature" ]]; then
    echo "Building API and worker images..."
    docker compose build api worker
    printf '%s\n' "$current_signature" > "$BUILD_STATE_FILE"
  fi
}

run_migrations() {
  echo "Running Django migrations..."
  docker compose run --rm --no-deps api python manage.py migrate
}

superuser_exists() {
  local result

  result="$({ docker compose run --rm --no-deps api python manage.py shell -c "from django.contrib.auth import get_user_model; import sys; sys.stdout.write('1' if get_user_model().objects.filter(is_superuser=True).exists() else '0')"; } | tail -n 1)"
  [[ "$result" == "1" ]]
}

start_stack() {
  local build_flag="${1:-}"
  local force_build="false"

  if [[ "$build_flag" == "--build" ]]; then
    force_build="true"
  fi

  ensure_service_images "$force_build"

  echo "Starting database and Redis..."
  docker compose up -d db redis

  wait_for_postgres
  run_migrations

  echo "Starting API and worker..."
  docker compose up -d api worker
}

start_frontend() {
  ensure_frontend_dependencies
  echo "Docker services are up. Starting Vite at http://localhost:5173"
  echo "Flow stays attached to the Vite dev server by design."
  echo "Press Ctrl+C to stop Vite, then run './flow down' if you also want to stop Docker services."
  exec npm --prefix frontend run dev
}

run_init() {
  ensure_env_files
  ensure_frontend_dependencies
  start_stack

  if superuser_exists; then
    echo "A Django superuser already exists."
  else
    echo "No Django superuser found. Creating one now..."
    docker compose run --rm --no-deps api python manage.py createsuperuser
  fi

  echo "Initial setup complete. Run './flow' from the repo root to start the full stack next time."
}

run_start() {
  local build_flag="${1:-}"

  ensure_env_files
  start_stack "$build_flag"
  start_frontend
}

run_down() {
  docker compose down
}

run_logs() {
  docker compose logs -f api worker
}

main() {
  local command="${1:-start}"
  shift || true

  require_command docker
  require_command npm

  case "$command" in
    start)
      run_start "$@"
      ;;
    init)
      run_init "$@"
      ;;
    down)
      run_down "$@"
      ;;
    logs)
      run_logs "$@"
      ;;
    help)
      usage
      ;;
    *)
      echo "Unknown command: $command" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"