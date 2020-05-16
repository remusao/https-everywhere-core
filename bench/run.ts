import * as fs from 'fs';

import { RuleSets } from '../src/rulesets';

const REQUESTS_PATH = process.argv[process.argv.length - 2];
const ENGINE_PATH = process.argv[process.argv.length - 1];

function min(arr: number[]): number {
  let acc = Number.MAX_VALUE;
  for (let i = 0; i < arr.length; i += 1) {
    acc = Math.min(acc, arr[i]);
  }
  return acc;
}

function max(arr: number[]): number {
  let acc = -1;
  for (let i = 0; i < arr.length; i += 1) {
    acc = Math.max(acc, arr[i]);
  }
  return acc;
}

function sum(arr: number[]): number {
  let s = 0.0;
  for (let i = 0; i < arr.length; i += 1) {
    s += arr[i];
  }
  return s;
}

function avg(arr: number[]): number {
  return sum(arr) / arr.length;
}

(async () => {
  const blob = fs.readFileSync(ENGINE_PATH);
  let engine = RuleSets.deserialize(blob);
  let diff;
  let start;

  // Bench serialization
  const serializationTimings = [];
  const deserializationTimings = [];
  let cacheSize = null;
  if (engine.serialize) {
    // Serialize
    let serialized;
    for (let i = 0; i < 100; i += 1) {
      start = process.hrtime();

      serialized = engine.serialize();
      if (serialized instanceof Promise) {
        serialized = await serialized;
      }

      diff = process.hrtime(start);
      serializationTimings.push((diff[0] * 1000000000 + diff[1]) / 1000000);
    }
    cacheSize = serialized.length || serialized.byteLength;

    // Deserialize
    for (let i = 0; i < 100; i += 1) {
      start = process.hrtime();
      const deserializing = RuleSets.deserialize(serialized);
      if (deserializing instanceof Promise) {
        await deserializing;
      }

      diff = process.hrtime(start);
      deserializationTimings.push((diff[0] * 1000000000 + diff[1]) / 1000000);
    }
  }

  // Create a clean engine for benchmarking
  engine = RuleSets.deserialize(blob);

  const stats: {
    serializationTimings: number[];
    deserializationTimings: number[];
    cacheSize: number;
    matches: number[];
    noMatches: number[];
    all: number[];
  } = {
    serializationTimings,
    deserializationTimings,
    cacheSize,
    matches: [],
    noMatches: [],
    all: [],
  };

  const urls: string[] = fs.readFileSync(REQUESTS_PATH, 'utf8').split(/[\n\r]+/g).map(line => JSON.parse(line)).map(({ url }) => url);
  let index = 0;
  for (let url of urls) {
    if (index !== 0 && index % 10000 === 0) {
      console.log(`Processed ${index} urls`);
    }
    index += 1;

    if (url.startsWith('https:')) {
      url = `http:${url.slice(6)}`;
    }

    if (!url.startsWith('http:')) {
      continue;
    }

    start = process.hrtime();
    const rewritten = engine.rewriteToSecureRequest(url);
    diff = process.hrtime(start);
    const totalHighResolution = (diff[0] * 1000000000 + diff[1]) / 1000000;

    if (rewritten !== null) {
      stats.matches.push(totalHighResolution);
    } else {
      stats.noMatches.push(totalHighResolution);
    }
  }

  const cmp = (a: number, b: number): number => a - b;

  stats.matches.sort(cmp);
  stats.noMatches.sort(cmp);
  stats.all = [...stats.matches, ...stats.noMatches].sort(cmp);

  const { matches, noMatches, all } = stats;

  console.log();
  console.log(
    `Avg serialization time (${serializationTimings.length} samples): ${avg(
      serializationTimings,
    )}`,
  );
  console.log(
    `Avg deserialization time (${deserializationTimings.length} samples): ${avg(
      deserializationTimings,
    )}`,
  );
  console.log(`Serialized size: ${cacheSize}`);
  console.log();
  console.log(`Total requests: ${all.length}`);
  console.log(`Total match: ${matches.length}`);
  console.log(`Total no match: ${noMatches.length}`);
  console.log();
  console.log(`Number of samples: ${matches.length}`);
  console.log(`Min match: ${min(matches)}`);
  console.log(`Max match: ${max(matches)}`);
  console.log(`Avg match: ${avg(matches)}`);
  console.log();
  console.log(`Number of samples: ${noMatches.length}`);
  console.log(`Min no match: ${min(noMatches)}`);
  console.log(`Max no match: ${max(noMatches)}`);
  console.log(`Avg no match: ${avg(noMatches)}`);
  console.log();
  console.log(`Number of samples: ${all.length}`);
  console.log(`Min (total): ${min(all)}`);
  console.log(`Max (total): ${max(all)}`);
  console.log(`Avg (total): ${avg(all)}`);
})();
