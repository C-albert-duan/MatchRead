-- Read-only. sync-facts log lines (last 12 h) that name one tournament,
-- minus the per-tick noise. Change the slug in the filter for another event.

select r.created, line
  from net._http_response r
  cross join lateral jsonb_array_elements_text(
         case when r.content ~ '^\s*\{' then (r.content::jsonb -> 'log') end
       ) as line
 where r.created > now() - interval '12 hours'
   and line like '%16750%' and line not like '%adaptive interval%' and line not like '%settlement held%' and line not like '%unexplained_absence%'
 order by r.created desc
 limit 30;
