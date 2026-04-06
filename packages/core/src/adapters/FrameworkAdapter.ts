export interface ProjectConfig {
  projectRoot: string
  bundleId: string
  scheme?: string
  metroPort?: number
}

export interface FrameworkAdapter {
  getBundleId(): string
  build(): Promise<string>
  getMetroLogs?(): AsyncIterable<string>
}
