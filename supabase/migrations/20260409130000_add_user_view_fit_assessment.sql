alter table user_views
add column if not exists shishka_fit_label text;

alter table user_views
add column if not exists shishka_fit_reason text;

alter table user_views
add column if not exists shishka_fit_profile_analyzed_at timestamptz;

alter table user_views
add column if not exists shishka_fit_scope_value text;
