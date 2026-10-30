import assert from "node:assert/strict";
import { test } from "node:test";
import {
  openLiveTournamentChannel,
  type LiveChannel,
  type LiveChannelClient,
  type LiveChannelHandlers,
} from "./channel.ts";

const TOURNAMENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOURNAMENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type FakeChannel = LiveChannel & {
  topic: string;
  emit: (payload: { eventType: string; new: unknown; old: unknown }) => void;
  status: (status: string) => void;
  system: (payload: unknown) => void;
};

function fakeClient() {
  const opened: FakeChannel[] = [];
  const removed: FakeChannel[] = [];
  const client: LiveChannelClient = {
    channel(topic) {
      const channel = {
        topic,
        emit: (_payload: { eventType: string; new: unknown; old: unknown }) => {},
        status: (_status: string) => {},
        system: (_payload: unknown) => {},
        on(event: string, _filter: unknown, callback: (payload: never) => void) {
          if (event === "system") channel.system = callback as (payload: unknown) => void;
          else channel.emit = callback as FakeChannel["emit"];
          return channel;
        },
        subscribe(callback: (status: string) => void) {
          channel.status = (status) => {
            callback(status);
            if (status === "CLOSED") removed.push(channel);
          };
          return channel;
        },
      } satisfies FakeChannel;
      opened.push(channel);
      return channel;
    },
    removeChannel(channel) {
      (channel as FakeChannel).status("CLOSED");
      return Promise.resolve("ok");
    },
  };
  return { client, opened, removed };
}

function handlers(): LiveChannelHandlers & {
  changes: number;
  subscribed: number;
  losses: string[];
  ready: number;
} {
  const record = {
    changes: 0,
    subscribed: 0,
    losses: [] as string[],
    ready: 0,
    onPostgresReady() {
      record.ready += 1;
    },
    onChange() {
      record.changes += 1;
    },
    onSubscribed() {
      record.subscribed += 1;
    },
    onDisconnect(status: string) {
      record.losses.push(status);
    },
  };
  return record;
}

test("unmount removes the realtime channel", () => {
  const { client, opened, removed } = fakeClient();
  const heard = handlers();
  const release = openLiveTournamentChannel(client, "evt-1", TOURNAMENT_A, heard);
  opened[0].status("SUBSCRIBED");
  assert.equal(heard.subscribed, 1);
  release();
  assert.deepEqual(removed, opened);
  opened[0].status("CLOSED");
  opened[0].emit({ eventType: "UPDATE", new: { public_ref: "fx-1" }, old: {} });
  assert.deepEqual(heard.losses, []);
  assert.equal(heard.changes, 0);
});

test("navigation removes the previous topic before another page subscribes", () => {
  const { client, opened, removed } = fakeClient();
  const first = openLiveTournamentChannel(client, "evt-1", TOURNAMENT_A, handlers());
  first();
  const second = openLiveTournamentChannel(client, "evt-2", TOURNAMENT_B, handlers());
  assert.equal(opened.length, 2);
  assert.deepEqual(removed, [opened[0]]);
  assert.equal(opened[0].topic, "live:tournament:evt-1");
  assert.equal(opened[1].topic, "live:tournament:evt-2");
  second();
  assert.deepEqual(removed, opened);
});

test("a page without a public tournament does not open a channel", () => {
  const { client, opened, removed } = fakeClient();
  const release = openLiveTournamentChannel(client, "42", TOURNAMENT_A, handlers());
  release();
  assert.equal(opened.length, 0);
  assert.equal(removed.length, 0);
});

test("the Postgres notice is reported apart from SUBSCRIBED, and only while open (F-2)", () => {
  const { client, opened } = fakeClient();
  const heard = handlers();
  const release = openLiveTournamentChannel(client, "evt-1", TOURNAMENT_A, heard);
  opened[0].status("SUBSCRIBED");
  assert.equal(heard.ready, 0);
  opened[0].system({ extension: "presence", status: "ok" });
  opened[0].system({ extension: "postgres_changes", status: "error", message: "boom" });
  assert.equal(heard.ready, 0);
  opened[0].system({ extension: "postgres_changes", status: "ok", message: "Subscribed to PostgreSQL" });
  assert.equal(heard.ready, 1);
  assert.equal(heard.subscribed, 1);
  release();
  opened[0].system({ extension: "postgres_changes", status: "ok" });
  assert.equal(heard.ready, 1);
});
