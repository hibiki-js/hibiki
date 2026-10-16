import type { HibikiProvider } from "./types.js"

export function defineProvider<TName extends string, TEvents extends object>(
  provider: HibikiProvider<TName, TEvents>,
): HibikiProvider<TName, TEvents> { return provider }
