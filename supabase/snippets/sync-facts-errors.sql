-- Read-only. Bodies of failed Edge responses, and when the failures began.

select r.created,
       r.status_code,
       left(r.content::text, 400) as body
  from net._http_response r
 where r.status_code >= 400
 order by r.created asc
 limit 3;
