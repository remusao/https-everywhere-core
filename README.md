# HTTPS Everywhere Core

This repository contains a work-in-progress matching engine for HTTPS
Everywhere rules. Its main goal is to propose a different design to
improve on current limitations of HTTPS Everywhere, such as:

* [Slow initialization](https://trac.torproject.org/projects/tor/ticket/23719).
* [High memory usage](https://github.com/EFForg/https-everywhere/issues/12232).

To this end, I started implementing a new engine with matching logic inspired by
the techniques deployed in [@cliqz/adblocker](https://github.com/cliqz-oss/adblocker)
over the years.

The results of the experiment are described in details in this blog post: https://remusao.github.io/posts/efficient-https-everywhere-engine.html

**TL;DR:** *In this post I describe the results of an experiment showing
how matching of HTTPS Everywhere rules can be made **between 4x and
10x more memory-efficient**, initialization of the matching engine
reduced to less than **25 milliseconds**, and HTTPS upgrades performed
in **0.0029** to **0.0073 milliseconds**, using a different design
inspired by modern adblockers, without relying on the Rust/WebAssembly
combo (i.e. pure JavaScript).*

This is still work-in-progress, though, but the prototype already shows
promising results and does better than the current core logic of HTTPS
Everywhere.
