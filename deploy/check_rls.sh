#!/usr/bin/env bash
sudo docker compose -f /opt/hrm/deploy/docker-compose.production.yml exec -T postgres \
  psql -U hrm -d hrm -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('users', 'attendance', 'leave_requests', 'payslips');"
