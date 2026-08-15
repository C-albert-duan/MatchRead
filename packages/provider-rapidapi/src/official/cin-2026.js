/**
 * Official ATP Cincinnati Open 2026 main-draw singles.
 * Source: ATP MDS, released 2026-08-13 01:50:56.
 * 128 slots = 96 players + 32 seed byes. TBD = Qualifier / Lucky Loser.
 */

function slug(last) {
  return String(last || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "player";
}

function p(last, given, seed, country, entry = null) {
  return {
    seat_kind: "player",
    is_bye: false,
    last_name: last,
    given_name: given,
    seed,
    country_code: country || "XXX",
    entry_status: entry,
  };
}

function bye() {
  return {
    seat_kind: "bye",
    is_bye: true,
    last_name: "Bye",
    given_name: null,
    seed: null,
    country_code: "XXX",
    entry_status: null,
  };
}

function tbd() {
  return {
    seat_kind: "tbd",
    is_bye: false,
    last_name: "Qualifier",
    given_name: null,
    seed: null,
    country_code: "XXX",
    entry_status: null,
  };
}

/** Ordered MDS seats, position 0 = sheet line 1. */
const ROWS = [
  p("Zverev", "Alexander", 1, "GER"),
  bye(),
  p("Norrie", "Cameron", null, "GBR"),
  p("Prizmic", "Dino", null, "CRO"),
  p("Fucsovics", "Marton", null, "HUN"),
  p("Atmane", "Terence", null, "FRA"),
  bye(),
  p("Etcheverry", "Tomas Martin", 26, "ARG"),
  p("Paul", "Tommy", 18, "USA"),
  bye(),
  tbd(),
  p("Hurkacz", "Hubert", null, "POL"),
  tbd(),
  p("Vallejo", "Adolfo Daniel", null, "PAR"),
  bye(),
  p("Vacherot", "Valentin", 15, "MON"),
  p("Jodar", "Rafael", 12, "ESP"),
  bye(),
  p("Shapovalov", "Denis", null, "CAN"),
  p("Mannarino", "Adrian", null, "FRA"),
  p("Burruchaga", "Roman", null, "ARG"),
  p("Struff", "Jan-Lennard", null, "GER"),
  bye(),
  p("Tabilo", "Alejandro", 22, "CHI"),
  p("Blockx", "Alexander", 28, "BEL"),
  bye(),
  p("Navone", "Mariano", null, "ARG"),
  p("Collignon", "Raphael", null, "BEL"),
  p("Ugo Carabelli", "Camilo", null, "ARG"),
  p("Kecmanovic", "Miomir", null, "SRB"),
  bye(),
  p("Cobolli", "Flavio", 7, "ITA"),
  p("Djokovic", "Novak", 3, "SRB"),
  bye(),
  p("Tirante", "Thiago Agustin", null, "ARG"),
  p("Choinski", "Jan", null, "GBR"),
  p("Landaluce", "Martin", null, "ESP"),
  p("Draper", "Jack", null, "GBR", "wc"),
  bye(),
  p("Arnaldi", "Matteo", 31, "ITA"),
  p("Darderi", "Luciano", 19, "ITA"),
  bye(),
  p("Hijikata", "Rinky", null, "AUS", "wc"),
  p("Monfils", "Gael", null, "FRA", "wc"),
  p("Svajda", "Zachary", null, "USA"),
  p("Bellucci", "Mattia", null, "ITA"),
  bye(),
  p("Mensik", "Jakub", 14, "CZE"),
  p("Lehecka", "Jiri", 9, "CZE"),
  bye(),
  tbd(),
  p("Berrettini", "Matteo", null, "ITA"),
  p("Hanfmann", "Yannick", null, "GER"),
  tbd(),
  bye(),
  p("Fils", "Arthur", 21, "FRA"),
  p("Fery", "Arthur", 32, "GBR"),
  bye(),
  tbd(),
  p("Duckworth", "James", null, "AUS"),
  p("Kopriva", "Vit", null, "CZE"),
  tbd(),
  bye(),
  p("de Minaur", "Alex", 5, "AUS"),
  p("Fritz", "Taylor", 6, "USA"),
  bye(),
  p("Michelsen", "Alex", null, "USA"),
  p("de Jong", "Jesper", null, "NED"),
  p("Merida", "Daniel", null, "ESP"),
  p("Cilic", "Marin", null, "CRO", "wc"),
  bye(),
  p("Bergs", "Zizou", 30, "BEL"),
  p("Fonseca", "Joao", 23, "BRA"),
  bye(),
  p("van de Zandschulp", "Botic", null, "NED"),
  p("Griekspoor", "Tallon", null, "NED"),
  tbd(),
  p("Majchrzak", "Kamil", null, "POL"),
  bye(),
  p("Ruud", "Casper", 11, "NOR"),
  p("Rublev", "Andrey", 13, "XXX"),
  bye(),
  p("Machac", "Tomas", null, "CZE"),
  p("Carreno Busta", "Pablo", null, "ESP"),
  p("Borges", "Nuno", null, "POR"),
  p("Kokkinakis", "Thanasi", null, "AUS", "pr"),
  bye(),
  p("Cerundolo", "Francisco", 20, "ARG"),
  p("Nakashima", "Brandon", 27, "USA"),
  bye(),
  p("Kovacevic", "Aleksandar", null, "USA"),
  p("Khachanov", "Karen", null, "XXX"),
  p("Medjedovic", "Hamad", null, "SRB"),
  tbd(),
  bye(),
  p("Medvedev", "Daniil", 4, "XXX"),
  p("Shelton", "Ben", 8, "USA"),
  bye(),
  tbd(),
  p("Brooksby", "Jenson", null, "USA"),
  p("Walton", "Adam", null, "AUS"),
  tbd(),
  bye(),
  p("Buse", "Ignacio", 29, "PER"),
  p("Humbert", "Ugo", 24, "FRA"),
  bye(),
  p("Marozsan", "Fabian", null, "HUN"),
  tbd(),
  tbd(),
  p("Altmaier", "Daniel", null, "GER"),
  bye(),
  p("Musetti", "Lorenzo", 10, "ITA"),
  p("Tien", "Learner", 16, "USA"),
  bye(),
  p("Baez", "Sebastian", null, "ARG"),
  p("Dimitrov", "Grigor", null, "BUL", "wc"),
  p("Shang", "Juncheng", null, "CHN", "pr"),
  p("Sonego", "Lorenzo", null, "ITA"),
  bye(),
  p("Tiafoe", "Frances", 17, "USA"),
  p("Rinderknech", "Arthur", 25, "FRA"),
  bye(),
  tbd(),
  p("Cerundolo", "Juan Manuel", null, "ARG"),
  p("Royer", "Valentin", null, "FRA"),
  p("Tsitsipas", "Stefanos", null, "GRE"),
  bye(),
  p("Auger-Aliassime", "Felix", 2, "CAN"),
];

if (ROWS.length !== 128) {
  throw new Error(`cin-2026 MDS must have 128 seats, got ${ROWS.length}`);
}

export const CIN_2026_OFFICIAL = {
  ref: "cin-2026",
  tour: "atp",
  draw_size: 128,
  source: "ATP Main Draw Singles, released 2026-08-13 01:50:56",
  seats: ROWS.map((row, position) => {
    const ref =
      row.seat_kind === "bye"
        ? `bye-${position}`
        : row.seat_kind === "tbd"
          ? `tbd-${position}`
          : `cin-${position}-${slug(row.last_name)}`;
    return {
      position,
      player_ref: ref,
      last_name: row.last_name,
      given_name: row.given_name,
      seed: row.seed,
      country_code: row.country_code,
      is_bye: row.is_bye,
      seat_kind: row.seat_kind,
      entry_status: row.entry_status,
      provider_player_id: null,
    };
  }),
};
