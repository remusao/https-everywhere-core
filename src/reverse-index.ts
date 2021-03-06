import { StaticDataView, EMPTY_UINT32_ARRAY, sizeOfBytes } from './data-view';
import { Compression } from './compression';

export interface Indexable {
  getSerializedSize: (compression: Compression) => number;
  getTokens: () => Uint32Array;
  serialize: (buffer: StaticDataView) => void;
}

// https://graphics.stanford.edu/~seander/bithacks.html#RoundUpPowerOf2
function nextPow2(v: number): number {
  v--;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  v++;
  return v;
}

/**
 * Generate unique IDs for requests, which is used to avoid matching the same
 * buckets multiple times on the same request (which can happen if a token
 * appears more than once in a URL).
 */
let UID = 1;
function getNextId(): number {
  const id = UID;
  UID = (UID + 1) % 1000000000;
  return id;
}

/**
 * List of filters being indexed using the same token in the index.
 */
interface Bucket<T extends Indexable> {
  readonly filters: T[];
  lastRequestSeen: number;
}

const EMPTY_BUCKET: number = Number.MAX_SAFE_INTEGER >>> 0;

/**
 * The Index is an accelerating data structure which allows finding a
 * subset of the rules given a list of tokens seen in a URL.
 */
export class Index<T extends Indexable> {
  public static deserialize<T extends Indexable>(
    buffer: StaticDataView,
    deserialize: (view: StaticDataView) => T,
    compression: Compression,
  ): Index<T> {
    const tokensLookupIndexSize = buffer.getUint32();
    const bucketsIndexSize = buffer.getUint32();
    const numberOfFilters = buffer.getUint32();

    // Alignement to 4 bytes is important here since `view` (Uint8Array) can
    // appear at any offset of `buffer`. But to be sure we can read back
    // Uint32Array directly from raw buffer, the alignement has to be a
    // multiple of 4. The same alignement is taken care of in `serialize`.
    const view = StaticDataView.fromUint8Array(
      buffer.getBytes(true /* align */),
      compression,
    );
    const tokensLookupIndex = view.getUint32ArrayView(tokensLookupIndexSize);
    const bucketsIndex = view.getUint32ArrayView(bucketsIndexSize);
    const filtersIndexStart = view.pos;
    view.seekZero(); // not strictly needed but make sure index can be compared with deep equal

    return new Index([], deserialize, compression).updateInternals({
      bucketsIndex,
      filtersIndexStart,
      numberOfFilters,
      tokensLookupIndex,
      view,
    });
  }

  // Internal, compact representation of the index. It contains three
  // distinct parts stored in the same typed array:
  //
  // 1. "tokens lookup index" allows to identify a sub-set of buckets which
  // likely contain filters for a given token. It is an approximate dispatch
  // table which maps a mask of N bits (N being smaller than 31 bits, the size
  // of a token) to a list of buckets having a 'token' sharing these same N
  // bits sub-set. If the binary representation of the token for bucket1 is
  // 101010 and suffix has size 3, then we would lookup the "tokens lookup
  // index" using the last 3 bits "010" which would give us the offset in our
  // typed array where we can start reading the filters of buckets having a
  // token ending with the same 3 bits. The value of N is always a power of 2
  // depending on the total number of filters stored in the index; determined
  // at the time `update(...)` is called.
  //
  // 2. "buckets index" is an array which associates tokens to filters. The
  // structure is: token, filter, token, filter, etc. To identify all the
  // filters indexed with 'token' a naive approach would be to iterate on
  // "buckets index" and collect all the filters indexed with 'token'. This
  // would be *very inefficient*! To make this process faster, filters in
  // "buckets index" are grouped so that buckets sharing the same suffix of N
  // bits in their indexing token (see "tokens lookup index") are stored side
  // by side in the typed array. To know where this section start given a
  // particular token, we use "tokens lookup index" which associated the suffix
  // of size N to an index in "buckets index". From there we can iterate on the
  // candidates.
  //
  // 3. "filters index" contains the filters themselves. "buckets index"
  // presented earlier does not contain filters, but an index to the "filters
  // index". This allows a filter to be indexed multiple times without
  // introducing any overhead; the filter can be associated with multiple
  // tokens in "buckets index" (each pointing to the same place in "filters
  // index") but its actual representation is stored only once in "filters
  // index".

  private bucketsIndex: Uint32Array = EMPTY_UINT32_ARRAY;
  private filtersIndexStart: number = 0;
  private numberOfFilters: number = 0;
  private tokensLookupIndex: Uint32Array = EMPTY_UINT32_ARRAY;
  private view: StaticDataView;

  // In-memory cache used to keep track of buckets which have been loaded from
  // the compact representation (i.e.: this.view). It is not strictly necessary
  // but will speed-up retrival of popular filters (since we do not have to
  // perform the lookup in "tokens index" and "buckets index" everytime).
  private readonly cache: Map<number, Bucket<T>> = new Map();

  // Function used to load a filter (e.g.: CosmeticFilter or NetworkFilter)
  // from its compact representation in the "filters index" section of the
  // typed array. Each filter exposes a `serialize(...)` method which is used
  // to store it in `this.view` (section "filters index"). While matching we
  // need to retrieve the instance of the filter to perform matching and use
  // `this.deserializeFilter(...)` to do so.
  private readonly deserializeFilter: (view: StaticDataView) => T;

  private readonly compression: Compression;

  constructor(
    filters: T[],
    deserialize: (view: StaticDataView) => T,
    compression: Compression,
  ) {
    this.compression = compression;
    this.view = StaticDataView.empty(compression);
    this.deserializeFilter = deserialize;

    if (filters.length !== 0) {
      this.update(filters);
    }
  }

  get size() {
    return this.numberOfFilters;
  }

  /**
   * Load all filters from this index in memory (i.e.: deserialize them from
   * the byte array into NetworkFilter or CosmeticFilter instances). This is
   * mostly useful for debugging or testing purposes.
   */
  public *values(): IterableIterator<T> {
    if (this.numberOfFilters === 0) {
      return;
    }

    // set view cursor at the start of "filters index"
    this.view.setPos(this.filtersIndexStart);

    for (let i = 0; i < this.numberOfFilters; i += 1) {
      yield this.deserializeFilter(this.view);
    }
  }

  /**
   * Return an array of all the tokens currently used as keys of the "buckets index".
   */
  public *keys(): IterableIterator<number> {
    const tokens: Set<number> = new Set();

    for (let i = 0; i < this.bucketsIndex.length; i += 2) {
      const token = this.bucketsIndex[i];
      if (tokens.has(token) === false) {
        yield token;
        tokens.add(token);
      }
    }
  }

  /**
   * Estimate the number of bytes needed to serialize this instance of `Index`.
   */
  public getSerializedSize(): number {
    // 12 = 4 bytes (tokensLookupIndex.length) + 4 bytes (bucketsIndex.length) + 4 bytes (numberOfFilters)
    return 12 + sizeOfBytes(this.view.buffer, true /* align */);
  }

  /**
   * Dump this index to `buffer`.
   */
  public serialize(buffer: StaticDataView): void {
    buffer.pushUint32(this.tokensLookupIndex.length);
    buffer.pushUint32(this.bucketsIndex.length);
    buffer.pushUint32(this.numberOfFilters);

    // Aligmenent is crucial here, see comment in `deserialize` for more info.
    buffer.pushBytes(this.view.buffer, true /* align */);
  }

  /**
   * Iterate on all filters found in buckets associated with the given list of
   * tokens. The callback is called on each of them. Early termination can be
   * achieved if the callback returns `false`.
   *
   * This will not check if each filter returned would match a given request but
   * is instead used as a list of potential candidates (much smaller than the
   * total set of filters; typically between 5 and 10 filters will be checked).
   */
  public iter(tokens: Uint32Array, cb: (value: T) => boolean): void {
    // Each request is assigned an ID so that we can keep track of the last
    // request seen by each bucket in the index. This provides a cheap
    // way to prevent filters from being inspected more than once per request
    // (which could happen if the same token appears more than once in the URL).
    const requestId = getNextId();

    for (const token of tokens) {
      if (this.iterBucket(token, requestId, cb) === false) {
        return;
      }
    }

    // Fallback to 0 (i.e.: wildcard bucket) bucket if nothing was found before.
    this.iterBucket(0, requestId, cb);
  }

  /**
   * Re-create the internal data-structure of the index *in-place*. It
   * needs to be called with a list of new filters and optionally a list of ids
   * (as returned by either NetworkFilter.getId() or CosmeticFilter.getId())
   * which need to be removed from the index.
   */
  public update(newFilters: T[]): void {
    // Reset internal cache on each update
    if (this.cache.size !== 0) {
      this.cache.clear();
    }

    let totalNumberOfTokens = 0;
    let totalNumberOfIndexedFilters = 0;
    const filtersTokens: Uint32Array[] = [];

    // Keep track of the final size of the buckets index. `bucketsIndexSize` is
    // the number of indexed filters, multiplied by 2 (since we store both the
    // token a filter is indexed with and the index of the filter).
    let bucketsIndexSize = 0;

    // Re-use the current size of "filters index" as a starting point so that
    // we only need to update with new or removed filters. This saves time if
    // we perform a small update on an existing index.
    let estimatedBufferSize =
      this.view.buffer.byteLength - this.filtersIndexStart;

    // Create a list of all filters which will be part of the index. This means
    // loading existing filters, removing the ones that need to be deleted and
    // adding the new ones.  At the same time, we update the estimation of
    // buffer size needed to store this index.
    let filters: T[] = [...this.values()];
    if (filters.length !== 0) {
      // Add new filters to the list and also update estimated size
      for (const filter of newFilters) {
        estimatedBufferSize += filter.getSerializedSize(this.compression);
        filters.push(filter);
      }
    } else {
      // In the case where there is no existing filter in the index (happens on
      // initialization), then we can take a fast-path and not check removed
      // filters at all. There is also no need to copy the array of filters.
      filters = newFilters;
      for (const filter of newFilters) {
        estimatedBufferSize += filter.getSerializedSize(this.compression);
      }
    }

    // No filters given; reset to empty index and abort.
    if (filters.length === 0) {
      this.updateInternals({
        bucketsIndex: EMPTY_UINT32_ARRAY,
        filtersIndexStart: 0,
        numberOfFilters: 0,
        tokensLookupIndex: EMPTY_UINT32_ARRAY,
        view: StaticDataView.empty(this.compression),
      });
      return;
    }

    const histogram = new Uint32Array(nextPow2(filters.length));

    // Tokenize all filters stored in this index. And compute a histogram of
    // tokens so that we can decide how to index each filter efficiently.
    for (const filter of filters) {
      // Tokenize `filter` and store the result in `filtersTokens` which will
      // be used in the next step to select the best token for each filter.
      const tokens = filter.getTokens();
      filtersTokens.push(tokens);

      // Update estimated size of "buckets index" based on number of times this
      // particular filter will be indexed.
      bucketsIndexSize += 2;
      totalNumberOfIndexedFilters += 1;

      // Each filter can be indexed more than once, so `getTokens(...)` returns
      // multiple sets of tokens. We iterate on all of them and update the
      // histogram for each.
      totalNumberOfTokens += tokens.length;
      for (const token of tokens) {
        histogram[token % histogram.length] += 1;
      }
    }

    // Add size of bucketsIndex to total size (x4 because these are 32 bits numbers)
    estimatedBufferSize += bucketsIndexSize * 4;

    // Prepare "tokens index" (see documentation in constructor of `Index` class above).
    const tokensLookupIndexSize: number = Math.max(
      2,
      nextPow2(totalNumberOfIndexedFilters),
    );
    const mask: number = tokensLookupIndexSize - 1;
    const suffixes: [number, number][][] = [];
    for (let i = 0; i < tokensLookupIndexSize; i += 1) {
      suffixes.push([]);
    }

    // Add size of tokensLookupIndex to total size (x4 because these are 32 bits numbers)
    estimatedBufferSize += tokensLookupIndexSize * 4;

    // At this point we know the number of bytes needed for the compact
    // representation of this index ("tokens index" + "buckets index" +
    // "filters index"). We allocate it at once and proceed with populating it.
    const buffer = StaticDataView.allocate(
      estimatedBufferSize,
      this.compression,
    );
    const tokensLookupIndex = buffer.getUint32ArrayView(tokensLookupIndexSize);
    const bucketsIndex = buffer.getUint32ArrayView(bucketsIndexSize);
    const filtersIndexStart = buffer.getPos();

    // For each filter, find the best token (least seen) based on histogram.
    // Since we are iterating again on the filters, we populate "filters index"
    // in the same loop and keep track of their indices so that we can later
    // populate "buckets index".
    for (let i = 0; i < filtersTokens.length; i += 1) {
      const tokens = filtersTokens[i];
      const filter: T = filters[i];

      // Serialize this filter and keep track of its index in the byte array;
      // it will be used in "buckets index" to point to this filter.
      const filterIndex = buffer.pos;
      filter.serialize(buffer);

      // Find best token (least seen) from `tokens` using `histogram`.
      let bestToken: number = 0; // default = wildcard bucket
      let minCount: number = totalNumberOfTokens + 1;
      for (const token of tokens) {
        const tokenCount = histogram[token % histogram.length];
        if (tokenCount < minCount) {
          minCount = tokenCount;
          bestToken = token;

          // Fast path, if the current token has only been seen once, we can
          // stop iterating since we will not find a better alternarive!
          if (minCount === 1) {
            break;
          }
        }
      }

      // `bestToken & mask` represents the N last bits of `bestToken`. We
      // group all filters indexed with a token sharing the same N bits.
      suffixes[bestToken & mask].push([bestToken, filterIndex]);
    }

    // Populate "tokens index" and "buckets index" based on best token found for each filter.
    let indexInBucketsIndex = 0;
    for (let i = 0; i < tokensLookupIndexSize; i += 1) {
      const filtersForMask = suffixes[i];
      tokensLookupIndex[i] = indexInBucketsIndex;
      for (const [token, index] of filtersForMask) {
        bucketsIndex[indexInBucketsIndex++] = token;
        bucketsIndex[indexInBucketsIndex++] = index;
      }
    }

    // Update internals
    buffer.seekZero();
    this.updateInternals({
      bucketsIndex,
      filtersIndexStart,
      numberOfFilters: filtersTokens.length,
      tokensLookupIndex,
      view: buffer,
    });
  }

  private updateInternals({
    bucketsIndex,
    filtersIndexStart,
    numberOfFilters,
    tokensLookupIndex,
    view,
  }: {
    bucketsIndex: Uint32Array;
    filtersIndexStart: number;
    numberOfFilters: number;
    tokensLookupIndex: Uint32Array;
    view: StaticDataView;
  }): Index<T> {
    this.bucketsIndex = bucketsIndex;
    this.filtersIndexStart = filtersIndexStart;
    this.numberOfFilters = numberOfFilters;
    this.tokensLookupIndex = tokensLookupIndex;
    this.view = view;
    return this;
  }

  /**
   * If a bucket exists for the given token, call the callback on each filter
   * found inside. An early termination mechanism is built-in, to stop iterating
   * as soon as `false` is returned from the callback.
   */
  private iterBucket(
    token: number,
    requestId: number,
    cb: (value: T) => boolean,
  ): boolean {
    let bucket: Bucket<T> | undefined = this.cache.get(token);

    // Lazily create bucket if it does not yet exist in memory. Lookup the
    // compact bucket representation and find all filters being associated with
    // `token`. Create a `Bucket` out of them and store them in cache.
    if (bucket === undefined) {
      const offset = token & (this.tokensLookupIndex.length - 1);
      const startOfBucket = this.tokensLookupIndex[offset];

      // We do not have any filters for this token
      if (startOfBucket === EMPTY_BUCKET) {
        return true;
      }

      // Since we do not store explicitly the number of filters in each
      // "bucket", we check the index of the next one and use it to infer the
      // number of filters (each filter being stored as a token + index to the
      // "filters store")
      const endOfBucket =
        offset === this.tokensLookupIndex.length - 1
          ? this.bucketsIndex.length
          : this.tokensLookupIndex[offset + 1];

      // Get indices of filters indexed with `token`, if any.
      const filtersIndices: number[] = [];
      for (let i = startOfBucket; i < endOfBucket; i += 2) {
        const currentToken = this.bucketsIndex[i];
        if (currentToken === token) {
          filtersIndices.push(this.bucketsIndex[i + 1]);
        }
      }

      // No filter indexed with `token`.
      if (filtersIndices.length === 0) {
        return true; // continue looking for a match
      }

      // If we have filters for `token` then deserialize filters in memory and
      // create a `Bucket` instance to hold them for future access.
      const filters: T[] = [];
      const view = this.view;
      for (const filterIndex of filtersIndices) {
        view.setPos(filterIndex);
        filters.push(this.deserializeFilter(view));
      }

      // Create new bucket with found filters (only optimize if we have more
      // than one filter).
      bucket = {
        filters,
        lastRequestSeen: -1, // safe because all ids are positive
      };

      this.cache.set(token, bucket);
    }

    // Look for matching filter in this bucket
    if (bucket.lastRequestSeen !== requestId) {
      bucket.lastRequestSeen = requestId;
      const filters = bucket.filters;
      for (const filter of filters) {
        // Break the loop if the callback returns `false`
        if (cb(filter) === false) {
          return false;
        }
      }
    }

    return true;
  }
}
