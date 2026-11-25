#!/bin/sh
# Run on the chosen Linux staging host after transferring a verified image archive.
set -eu
cd /opt/rental-staging
case "${1:-}" in *[!0-9a-f]*|'') echo 'Expected immutable commit SHA' >&2; exit 1;; esac
[ "${#1}" = 40 ] || exit 1
export IMAGE_TAG="$1"
test -s local/web.env && test -s local/api.env && test -s local/migrator.env
test -s local/tls/fullchain.pem && test -s local/tls/privkey.pem
# Never run down -v, migrate dev, db push or reset during release.
docker load -i images.tar
docker compose --env-file .env -f compose.yaml up -d --wait postgres redis
docker compose --env-file .env -f compose.yaml run --rm migrate
docker compose --env-file .env -f compose.yaml up -d --wait --wait-timeout 120 api web proxy
docker compose --env-file .env -f compose.yaml exec -T redis redis-cli ping | grep -qx PONG
echo 'Containers ready. Run external HTTPS smoke before accepting the release.'
