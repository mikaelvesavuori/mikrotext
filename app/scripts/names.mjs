const adjectives = [
  "Amber",
  "Blue",
  "Bright",
  "Calm",
  "Clear",
  "Grey",
  "Green",
  "Quiet",
  "Red",
  "Silver",
  "Soft",
  "Still",
  "Warm",
  "White"
];

const nouns = [
  "Ash",
  "Birch",
  "Cedar",
  "Cloud",
  "Field",
  "Hill",
  "Lake",
  "Maple",
  "Meadow",
  "Moon",
  "Pine",
  "River",
  "Stone",
  "Willow"
];

export function randomName() {
  return `${pick(adjectives)} ${pick(nouns)} ${randomNumber(10, 99)}`;
}

function pick(values) {
  return values[randomNumber(0, values.length - 1)];
}

function randomNumber(min, max) {
  const range = max - min + 1;
  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);

  return min + (value[0] % range);
}
