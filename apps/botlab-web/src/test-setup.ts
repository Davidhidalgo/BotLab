// Testing Library only advances fake timers inside waitFor/findBy when it
// sees a `jest` global; expose Vitest's timer control under that name.
Object.assign(globalThis, {
  jest: {
    advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
  },
});
