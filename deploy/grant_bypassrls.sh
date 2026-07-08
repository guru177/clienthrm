#!/usr/bin/env bash
# Check hrm user privileges and grant BYPASSRLS
sudo docker compose -f /opt/hrm/deploy/docker-compose.production.yml exec -T postgres \
  psql -U hrm -d hrm -c "SELECT usename, usesuper, usebypassrls FROM pg_user WHERE usename='hrm';"

# hrm user might be superuser if created with it - try to grant itself
sudo docker compose -f /opt/hrm/deploy/docker-compose.production.yml exec -T postgres \
  psql -U hrm -d hrm -c "ALTER ROLE hrm BYPASSRLS;" || echo "Cannot self-grant BYPASSRLS"

# Check the postgres.conf pg_hba - what users exist?
sudo docker compose -f /opt/hrm/deploy/docker-compose.production.yml exec -T postgres \
  psql -U hrm -d hrm -c "SELECT usename, usesuper, usebypassrls FROM pg_user;"
