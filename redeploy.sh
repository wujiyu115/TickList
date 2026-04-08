#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DEPLOY_MODE="${DEPLOY_MODE:-pull}"
REMOTE_IMAGE="${REMOTE_IMAGE:-wujiyu115/ticklist:latest}"
LOCAL_IMAGE="${LOCAL_IMAGE:-ticklist:latest}"
IMAGE_NAME="${IMAGE_NAME:-}"
CONTAINER_NAME="${CONTAINER_NAME:-ticklist}"
CONTAINER_PORT="${CONTAINER_PORT:-5000}"
HOST_PORT_OVERRIDE="${HOST_PORT:-}"
DB_CONNECT_STRING_OVERRIDE="${DB_CONNECT_STRING:-}"
DATA_VOLUME_OVERRIDE="${DATA_VOLUME:-}"
DATA_BIND_SOURCE_OVERRIDE="${DATA_BIND_SOURCE:-}"
CONFIG_BIND_SOURCE_OVERRIDE="${CONFIG_BIND_SOURCE:-}"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

fail() {
  log "$*"
  exit 1
}

container_exists() {
  docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1
}

container_env() {
  local key="$1"
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER_NAME" 2>/dev/null \
    | awk -F= -v prefix="${key}=" '$0 ~ "^" prefix {sub("^" prefix, ""); print; exit}'
}

container_mount() {
  local dest="$1"
  docker inspect --format '{{range .Mounts}}{{if eq .Destination "'"$dest"'"}}{{.Type}}|{{.Name}}|{{.Source}}{{end}}{{end}}' "$CONTAINER_NAME" 2>/dev/null
}

container_host_port() {
  docker inspect --format '{{with index .NetworkSettings.Ports "'"$CONTAINER_PORT"'/tcp"}}{{(index . 0).HostPort}}{{end}}' "$CONTAINER_NAME" 2>/dev/null
}

update_repo() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return
  fi

  if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
    log "Detected tracked local changes, skip git pull."
    return
  fi

  log "Fetching latest git refs"
  git fetch --prune

  if ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    log "No upstream configured, skip git pull."
    return
  fi

  local upstream ahead behind
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}')"
  read -r ahead behind < <(git rev-list --left-right --count HEAD..."$upstream")

  if (( ahead > 0 && behind > 0 )); then
    log "Branch diverged from $upstream, skip git pull."
    return
  fi

  if (( behind > 0 )); then
    log "Fast-forwarding from $upstream"
    git pull --ff-only
    return
  fi

  log "Git already up to date."
}

wait_for_container() {
  local has_healthcheck status elapsed=0
  has_healthcheck="$(docker inspect --format '{{if .Config.Healthcheck}}yes{{else}}no{{end}}' "$CONTAINER_NAME")"

  while (( elapsed < 120 )); do
    if [[ "$has_healthcheck" == "yes" ]]; then
      status="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")"
      if [[ "$status" == "healthy" ]]; then
        log "Container is healthy."
        return
      fi
      if [[ "$status" == "unhealthy" ]]; then
        log "Container became unhealthy."
        docker logs --tail 100 "$CONTAINER_NAME"
        exit 1
      fi
    else
      status="$(docker inspect --format '{{.State.Status}}' "$CONTAINER_NAME")"
      if [[ "$status" == "running" ]]; then
        log "Container is running."
        return
      fi
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  log "Timed out waiting for container readiness."
  docker logs --tail 100 "$CONTAINER_NAME"
  exit 1
}

prepare_image() {
  case "$DEPLOY_MODE" in
    pull)
      image_name="${IMAGE_NAME:-$REMOTE_IMAGE}"
      log "Pulling image $image_name"
      docker pull "$image_name" >/dev/null
      ;;
    build)
      image_name="${IMAGE_NAME:-$LOCAL_IMAGE}"
      log "Building image $image_name"
      docker build --pull -t "$image_name" .
      ;;
    *)
      fail "Unsupported DEPLOY_MODE=$DEPLOY_MODE. Use pull or build."
      ;;
  esac
}

update_repo

host_port="$HOST_PORT_OVERRIDE"
db_connect_string="$DB_CONNECT_STRING_OVERRIDE"
data_mount_type=""
data_mount_name=""
data_mount_source=""
config_bind_source="$CONFIG_BIND_SOURCE_OVERRIDE"
declare -A preserved_envs=()

if container_exists; then
  if [[ -z "$host_port" ]]; then
    host_port="$(container_host_port)"
  fi
  if [[ -z "$db_connect_string" ]]; then
    db_connect_string="$(container_env DB_CONNECT_STRING)"
  fi

  mount_info="$(container_mount /app/data)"
  if [[ -n "$mount_info" ]]; then
    IFS='|' read -r data_mount_type data_mount_name data_mount_source <<< "$mount_info"
  fi

  if [[ -z "$config_bind_source" ]]; then
    config_info="$(container_mount /app/config.yaml)"
    if [[ -n "$config_info" ]]; then
      IFS='|' read -r _ _ config_bind_source <<< "$config_info"
    fi
  fi

  for env_key in WEBAUTHN_RP_ID WEBAUTHN_RP_NAME WEBAUTHN_ORIGIN REGISTER_ENABLED; do
    env_value="$(container_env "$env_key")"
    if [[ -n "$env_value" ]]; then
      preserved_envs["$env_key"]="$env_value"
    fi
  done
fi

host_port="${host_port:-5000}"
db_connect_string="${db_connect_string:-sqlite:///data/ticklist.db}"

if [[ -n "$DATA_BIND_SOURCE_OVERRIDE" ]]; then
  data_mount_type="bind"
  data_mount_source="$DATA_BIND_SOURCE_OVERRIDE"
elif [[ -n "$DATA_VOLUME_OVERRIDE" ]]; then
  data_mount_type="volume"
  data_mount_name="$DATA_VOLUME_OVERRIDE"
elif [[ -z "$data_mount_type" ]]; then
  data_mount_type="volume"
  data_mount_name="ticklist_data"
fi

prepare_image

if container_exists; then
  log "Removing existing container $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

run_args=(run -d --name "$CONTAINER_NAME" -p "${host_port}:${CONTAINER_PORT}")

if [[ "$data_mount_type" == "bind" ]]; then
  mkdir -p "$data_mount_source"
  run_args+=(-v "${data_mount_source}:/app/data")
else
  run_args+=(-v "${data_mount_name}:/app/data")
fi

if [[ -n "$config_bind_source" ]]; then
  run_args+=(-v "${config_bind_source}:/app/config.yaml")
fi

run_args+=(-e "DB_CONNECT_STRING=${db_connect_string}")

for env_key in WEBAUTHN_RP_ID WEBAUTHN_RP_NAME WEBAUTHN_ORIGIN REGISTER_ENABLED; do
  env_value="${!env_key:-${preserved_envs[$env_key]:-}}"
  if [[ -n "$env_value" ]]; then
    run_args+=(-e "${env_key}=${env_value}")
  fi
done

run_args+=("$image_name")

log "Starting container $CONTAINER_NAME"
container_id="$(docker "${run_args[@]}")"
log "Started container ${container_id}"

wait_for_container

log "Done. URL: http://localhost:${host_port}"
