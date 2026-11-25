"use client";

import { Component, type ReactNode } from "react";

// A 3D canvas that can't start (no WebGL, a blocklisted or crashed GPU driver, a model that fails to load)
// must never take the page down with it: it just isn't there. `onError` lets the page carry on (e.g. the
// loader stops waiting for it).
export default class Safe extends Component<{ children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== "production") console.warn("[safe] a 3D layer failed and was left out:", error);
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
