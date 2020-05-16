# HTTPS Everywhere Core

This repository contains a work-in-progress matching engine for HTTPS
Everywhere rules. Its main goal is to propose a different design to
improve on current limitations of HTTPS Everywhere, such as:

* [Slow initialization](https://trac.torproject.org/projects/tor/ticket/23719).
* [High memory usage](https://github.com/EFForg/https-everywhere/issues/12232).

To this end, I started implementing a new engine with matching logic inspired by
the techniques deployed in [@cliqz/adblocker](https://github.com/cliqz-oss/adblocker)
over the years. Currently the performance is as follows:

* Memory usage: `~6 MB` (x2-3 less than HTTPS Everywhere in Rust/WebAsm).
* Loading rules from XML: `~1 second` (But `2.7 seconds` with JIT disabled).
* Serialization of the engine: `1.5ms`.
* Deserialization (i.e. loading from cache): `3ms`.
* Decision time: `~0.014ms`.

This is still work-in-progress, though, but the prototype already shows
promising results and does better than the current core logic of HTTPS
Everywhere on some metrics.
