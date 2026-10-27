# Live normalizer fields

Evidence is [provider-capture-findings.md](./provider-capture-findings.md) and the two gitignored capture files. This note is only the field map the normalizer is allowed to read.

| Question | From the captured bytes |
|----------|-------------------------|
| REST fixture id vs socket event id | Unknown. No socket frame was stored. Live `id` did not equal fixture `id` or fixture `matchId` on the one compared tournament. |
| Player ids | Live `matchId` segments 1 and 2 matched fixture `player1Id` / `player2Id` for the four in-play pairs on that tournament. `player1` and `player2` on a live row have `name` only. |
| seasonId | The key is absent. The tournament id is the third segment of `matchId`. |
| Socket payload | Unknown. Neither file contains one. |
| Snapshot vs delta | Unknown for a socket event. The REST live list is a full `results` array on each call. |
| Field names | `id`, `matchId`, `status`, `score`, `points`, `indicator`, `updatedAt` (later file only). On that later file, `updatedAt` is epoch milliseconds. Not `servingPlayerId`, `seq`, `winnerId`, `seasonId`, `eventId`, or `match_id`. |
| Token path | `GET /tennis/v2/extend/api/ws-token`. Body keys `success` and `token`. |
| Token lifetime | `exp - iat` is 86400 on all three HTTP 200 bodies. Expiry is the `exp` claim. The captures contain no `TOKEN_EXPIRED` error, and expiry was not waited out, so there is no proactive refresh timer. How the token is attached is unknown. |
| Side order | `matchId` segment 1 is the player on the left of `score` and `points`. When that player is the match's side b, both are swapped before storing, so stored text reads from side a. A first player that is not one of the sides keeps the provider order. |
| Score | `score` is comma-separated `N-N` sets. The current game is `points`, not `currentGameScore` or `completedSets`. Tennis values are `0`, `15`, `30`, `40`, and `A`. `A` is stored as `AD` and is not an integer. |
| Serving | No server id. `indicator` is `0,1`, `1,0`, `0,0`, or null, and is not used as a server. |
| Tie-break | No parenthesis and no separate tie-break field. Some set texts are `7-6` or `6-7`, and the `points` beside those sets are still a tennis game or null. The only non-tennis `points` value is `5-2`, and that row’s `score` is also `5-2`, so it is not stored as a game or as a tie-break. |
| Retirement / suspension | Not on any live row. Every live `status` is `InPlay`. Any other live status is unknown: it is not a phase, and it does not settle. Archive `result_type` `retired` is a different payload and is the only non-`completed` archive type in the captures. |
| Flag | A live row has `tourType` and no `tier`, so the eligibility flag is not derived from it. The stored phase flag stays `live` or `provisional`. Break point and match point are derived only from side-oriented sets, a canonical game, serving where the break needs it, and sets-to-win 2 or 3. Anything short of that is null. The normalizer leaves `pointFlags` null; My Tennis derives match point at read time with sets-to-win from the tournament's tour and tier (D-M4-1). A provider critical or marketing label is not read. `InPlay` is the only status the normalizer treats as in play. |

`seq`, `replayPhase`, and `replayWinnerId` are replay-harness fields. They are not provider keys.

Backfill does not copy a fixture id. A live row is stored when `tourType`, the third `matchId` segment, and the two player segments pick one match. `results[].id` is the stored provider event id. A pair that hits zero or two matches stays unmapped. Player names are not read.
