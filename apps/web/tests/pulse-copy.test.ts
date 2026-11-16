/**
 * Fix list P2-9: the Daily Check speaks the viewer's language, and the
 * English catalogue matches core's default copy word for word.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tf, t, type MessageKey } from "../../../packages/i18n/src/index.ts";
import {
  PULSE_EN,
  computeDailyCheck,
  type PulseInput,
  type PulseSay,
} from "../../../packages/core/src/pulse.ts";

const base: PulseInput = {
  eventName: "Paris",
  leagueSlug: "l",
  tournamentRef: "t",
  memberCount: 4,
  submittedCount: 2,
  youSubmitted: false,
  hasDraw: true,
  locked: false,
  eventComplete: false,
  you: null,
  leader: null,
  fieldSize: 4,
  seasonPosition: null,
  seasonPoints: null,
  hour: 9,
};

function sayIn(locale: "en" | "es" | "ja"): PulseSay {
  return (key, vars) => tf(locale, `pulse.${key}` as MessageKey, vars ?? {});
}

describe("Daily Check copy", () => {
  it("English catalogue equals core's PULSE_EN", () => {
    for (const [key, text] of Object.entries(PULSE_EN)) {
      assert.equal(t("en", `pulse.${key}` as MessageKey), text, key);
    }
  });

  it("the default (no say) and the English catalogue agree", () => {
    assert.deepEqual(computeDailyCheck({ ...base, say: sayIn("en") }), computeDailyCheck(base));
  });

  it("Spanish and Japanese viewers get their own copy", () => {
    const es = computeDailyCheck({ ...base, say: sayIn("es") });
    assert.equal(es.frame, "Esta mañana");
    assert.equal(es.headline, "Faltan 2 cuadros.");
    const ja = computeDailyCheck({ ...base, say: sayIn("ja") });
    assert.equal(ja.frame, "今朝");
    assert.match(ja.detail, /4人中2人/);
  });

  it("uses the ordinal it is given", () => {
    const you = {
      position: 2, previousPosition: 2, positionDelta: 0, score: 5, previousScore: 5,
      scoreDelta: 0, upside: 0, championAlive: true, voidedPicks: 0, championRef: null, championName: null,
    };
    const check = computeDailyCheck({
      ...base, locked: true, submittedCount: 4, you, say: sayIn("ja"), ordinal: (n) => `${n}位`,
    });
    assert.equal(check.beats[0].headline, "2位です。");
  });
});
