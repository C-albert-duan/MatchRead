-- Read-only. The last sync-facts responses cron stored, with the log lines
-- that say which events ran and what each bound or skipped.

select r.created,
       r.status_code,
       r.timed_out,
       left(r.error_msg, 160) as error_msg,
       line
  from net._http_response r
  left join lateral jsonb_array_elements_text(
         case when r.content ~ '^\s*\{' then (r.content::jsonb -> 'log') end
       ) as line on true
 where r.created > now() - interval '40 minutes'
   and (line is null
        or line ~ '(events in window|results bound|error|fatal|held|no match tree|applied)')
 order by r.created desc
 limit 60;
