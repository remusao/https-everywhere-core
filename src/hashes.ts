import { StaticDataView, sizeOfBytes, EMPTY_UINT32_ARRAY } from './data-view';
import { fastHash } from './utils';
import { Compression } from './compression';

/**
 * Find `elt` in `arr` between indices `start` (included) and `end` (excluded)
 * using a binary search algorithm.
 */
function binSearch(
  arr: Uint32Array,
  elt: number,
  start: number,
  end: number,
): number {
  if (start >= end) {
    return -1;
  }

  let low = start;
  let high = end - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midVal = arr[mid];
    if (midVal < elt) {
      low = mid + 1;
    } else if (midVal > elt) {
      high = mid - 1;
    } else {
      return mid;
    }
  }

  return -1;
}

export class Hashes {
  static deserialize(buffer: StaticDataView): Hashes {
    const view = StaticDataView.fromUint8Array(
      buffer.getBytes(true /* align */),
      Compression.noop(),
    );
    const packed = view.getUint32ArrayView(view.buffer.byteLength >> 2);

    return new Hashes([]).updateInternals({
      packed,
      view,
    });
  }

  private view: StaticDataView = StaticDataView.empty(Compression.noop());
  private packed: Uint32Array = EMPTY_UINT32_ARRAY; // NOTE: view on top of `view`

  constructor(entries: [string, number][]) {
    if (entries.length === 0) {
      this.updateInternals({
        view: StaticDataView.empty(Compression.noop()),
        packed: EMPTY_UINT32_ARRAY,
      });
      return;
    }

    // Keep track of maximum number of labels seen in a given rule. This allows us
    // to make sure that all sections of the typed array (wildcards, exceptions
    // and normal rules) have the same size and we do not need to check that while
    // matching.
    let maximumNumberOfLabels = 0;
    let totalPackedSize = 1; // Maximum number of labels
    const hashesPerLabels: Map<number, [number, number][]> = new Map();

    for (const [target, ruleset] of entries) {
      // Count number of labels in this suffix
      const numberOfLabels = target.split('.').length;
      maximumNumberOfLabels = Math.max(maximumNumberOfLabels, numberOfLabels);

      let hashes = hashesPerLabels.get(numberOfLabels);
      if (hashes === undefined) {
        hashes = [];
        hashesPerLabels.set(numberOfLabels, hashes);
      }
      totalPackedSize += 2;
      hashes.push([fastHash(target), ruleset]);
    }

    totalPackedSize += Math.max(...hashesPerLabels.keys());
    const view = StaticDataView.allocate(
      totalPackedSize * 4,
      Compression.noop(),
    );
    const packed = view.getUint32ArrayView(totalPackedSize);

    packed[0] = maximumNumberOfLabels;

    let index = 1;
    for (let label = 1; label <= maximumNumberOfLabels; label += 1) {
      const hashes = hashesPerLabels.get(label) || [];
      packed[index++] = hashes.length;

      hashes.sort(([a], [b]) => {
        if (a < b) {
          return -1;
        }
        if (a > b) {
          return 1;
        }
        return 0;
      });

      for (const [hash] of hashes) {
        packed[index++] = hash;
      }

      // TODO - could be using the StaticDataView abstraction and store ruleset
      // IDs as uint16 instead of uint32 to save ~400KB
      for (const [_, ruleset] of hashes) {
        packed[index++] = ruleset;
      }
    }

    view.seekZero();
    this.view = view;
    this.packed = packed;
  }

  private updateInternals({
    packed,
    view,
  }: {
    packed: Uint32Array;
    view: StaticDataView;
  }): Hashes {
    view.seekZero(); // not strictly needed but make sure hashes can be compared with deep equal
    this.packed = packed;
    this.view = view;
    return this;
  }

  getSerializedSize(): number {
    return sizeOfBytes(this.view.buffer, true /* align */);
  }

  serialize(buffer: StaticDataView): void {
    buffer.pushBytes(this.view.buffer, true /* align */);
  }

  iter(hostname: string, cb: (ruleset: number) => void): void {
    if (this.packed.length === 0) {
      return;
    }

    const packed = this.packed;
    const maximumNumberOfLabels = packed[0];
    const numberOfLabels = hostname.split('.').length;

    if (numberOfLabels > maximumNumberOfLabels) {
      return;
    }

    const hash = fastHash(hostname);

    // Identify section of the array containing hashes of domains having the same
    // number of labels than `hostname`. We then perform a binary search to
    // identify candidates.
    let index = 1;
    for (let i = 1; i < numberOfLabels; i += 1) {
      index += 2 * packed[index] + 1;
    }

    const numberOfHashes = packed[index];
    if (numberOfHashes === 0) {
      return;
    }

    const matchIndex = binSearch(
      packed,
      hash,
      index + 1,
      index + numberOfHashes + 1,
    );

    if (matchIndex !== -1) {
      cb(packed[matchIndex + numberOfHashes]);

      let start = matchIndex - 1;
      while (start >= 0 && packed[start] === hash) {
        cb(packed[start + numberOfHashes]);
        start -= 1;
      }

      let end = matchIndex + 1;
      while (end < packed.length && packed[end] === hash) {
        cb(packed[end + numberOfHashes]);
        end += 1;
      }
    }
  }
}
