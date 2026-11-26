#!/usr/bin/env bash
# Stage 2 on cue-prod-01: PostgreSQL 17 (PGDG), listening on localhost only.
# Creates database `cue`, the app role `cue_app` and the Auth role
# `supabase_auth_admin`. Passwords are generated here and kept root-only in
# /etc/cue-db/. Safe to re-run (keeps existing passwords).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== PGDG apt repo + PostgreSQL 17"
if ! command -v /usr/lib/postgresql/17/bin/postgres >/dev/null 2>&1; then
  apt-get -y -q install postgresql-common ca-certificates
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  apt-get -y -q install postgresql-17
fi

echo "== tuning (12 GB box shared with the app)"
cat > /etc/postgresql/17/main/conf.d/cue.conf <<'EOF'
listen_addresses = 'localhost'
max_connections = 100
shared_buffers = 1GB
effective_cache_size = 4GB
work_mem = 16MB
maintenance_work_mem = 256MB
wal_compression = on
checkpoint_timeout = 15min
max_wal_size = 2GB
random_page_cost = 1.1
log_min_duration_statement = 1000
log_line_prefix = '%m [%p] %u@%d '
timezone = 'UTC'
password_encryption = scram-sha-256
EOF
systemctl restart postgresql@17-main
systemctl enable postgresql@17-main >/dev/null

echo "== roles and database"
install -d -m 700 /etc/cue-db
for r in cue_app supabase_auth_admin; do
  [ -s /etc/cue-db/$r.pw ] || (umask 077; openssl rand -hex 24 > /etc/cue-db/$r.pw)
done
APP_PW=$(cat /etc/cue-db/cue_app.pw)
AUTH_PW=$(cat /etc/cue-db/supabase_auth_admin.pw)
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -q <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='cue_app') then create role cue_app login; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin login; end if;
  -- Roles Supabase Auth's migrations grant to (no login).
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end \$\$;
alter role cue_app password '$APP_PW';
alter role supabase_auth_admin password '$AUTH_PW';
SQL
if ! runuser -u postgres -- psql -tAc "select 1 from pg_database where datname='cue'" | grep -q 1; then
  runuser -u postgres -- createdb -O cue_app cue
fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -q -d cue <<'SQL'
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to cue_app;
alter role supabase_auth_admin set search_path = auth;
SQL

echo "== local connections need a password (scram), no remote access"
HBA=/etc/postgresql/17/main/pg_hba.conf
grep -q '^# cue' $HBA || cat >> $HBA <<'EOF'
# cue: app and auth connect over TCP on localhost only
host    cue    cue_app,supabase_auth_admin    127.0.0.1/32    scram-sha-256
EOF
systemctl reload postgresql@17-main
runuser -u postgres -- psql -tAc "select version()"
ss -ltnp | grep 5432
echo "== done"
