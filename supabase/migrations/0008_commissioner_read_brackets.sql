-- 0008_commissioner_read_brackets.sql
-- Settlement must grade every submitted bracket in the league. RLS previously
-- allowed select of own brackets only, so Run settlement only saw the
-- commissioner's row.

drop policy if exists brackets_select_commissioner on public.brackets;
create policy brackets_select_commissioner on public.brackets
  for select using (public.is_league_commissioner(league_id));
