create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare desired_role public.user_role;
begin
  desired_role := case
    when coalesce(new.raw_user_meta_data->>'role', 'operator') = 'admin' then 'admin'::public.user_role
    else 'operator'::public.user_role
  end;

  insert into public.profiles (id, full_name, role, trial_started_at, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    desired_role,
    now(),
    now() + interval '3 days'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    updated_at = now();

  insert into public.wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, full_name, role, trial_started_at, trial_ends_at)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  case when coalesce(u.raw_user_meta_data->>'role', 'operator') = 'admin' then 'admin'::public.user_role else 'operator'::public.user_role end,
  now(),
  now() + interval '3 days'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

insert into public.wallets (user_id, balance)
select u.id, 0
from auth.users u
left join public.wallets w on w.user_id = u.id
where w.user_id is null;
