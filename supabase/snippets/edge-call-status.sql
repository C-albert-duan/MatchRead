-- Read-only. What did the last cron POSTs to Edge return, and how many settled
-- matches still lack an official score?

select 'http' as kind,
       r.status_code::text as a,
       coalesce(r.timed_out::text, '') as b,
       left(coalesce(r.error_msg, r.content::text, ''), 160) as c,
       r.created::text as d
  from net._http_response r
 order by r.created desc
 limit 12;

select 'score_debt' as kind,
       t.slug as a,
       count(*)::text as b,
       max(m.settled_at)::text as c,
       '' as d
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
 where m.settled_at is not null
   and not m.voided
   and m.official_score is null
 group by t.slug
 order by count(*) desc
 limit 15;
