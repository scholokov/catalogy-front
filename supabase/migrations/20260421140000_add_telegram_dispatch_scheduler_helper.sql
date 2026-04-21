create extension if not exists pg_net;

create or replace function request_telegram_dispatch(
  dispatch_url text,
  dispatch_secret text,
  dispatch_limit int default 20,
  dispatch_dry_run boolean default false
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := dispatch_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || dispatch_secret
    ),
    body := jsonb_build_object(
      'limit', greatest(1, least(dispatch_limit, 100)),
      'dryRun', dispatch_dry_run
    ),
    timeout_milliseconds := 10000
  );
$$;
