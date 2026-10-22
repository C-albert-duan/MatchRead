-- Read-only. How many settled matches have an official score, and the most
-- recent settles (a working sync-facts keeps this moving).

select count(*) filter (where official_score is not null) as scored,
       count(*) filter (where official_score is null) as unscored,
       max(settled_at) as last_settled_at,
       count(*) filter (where settled_at > now() - interval '30 minutes') as settled_last_30m
  from public.matches
 where settled_at is not null
   and not voided;
