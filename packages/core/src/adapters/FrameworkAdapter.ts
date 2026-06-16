export interface ProjectConfig {
  projectRoot: string
  bundleId: string
  scheme?: string
  metroPort?: number
  /**
   * Target platform for the framework build. Defaults to 'ios' so existing
   * callers are unaffected. 'android' selects the gradlew assembleDebug path.
   */
  platform?: 'ios' | 'android'
}

export interface FrameworkAdapter {
  getBundleId(): string
  build(): Promise<string>
  getMetroLogs?(): AsyncIterable<string>
}
