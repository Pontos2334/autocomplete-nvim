// Stub for posthog telemetry - disabled in standalone mode

export enum PosthogFeatureFlag {
  AutocompleteTimeout = "autocomplete-timeout",
  RecentlyVisitedRangesNumSurroundingLines = "recently-visited-ranges-num-surrounding-lines",
}

export class Telemetry {
  static async capture() {}
  static async captureError() {}
  static async setup() {}
  static async getFeatureFlag() { return undefined; }
  static async getValueForFeatureFlag() { return undefined; }
  static shutdownPosthogClient() {}
}
