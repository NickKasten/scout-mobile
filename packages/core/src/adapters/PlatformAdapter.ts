export interface Point {
  x: number
  y: number
}

export interface EnvironmentCheck {
  name: string
  ok: boolean
  message: string
  hint?: string
}

export interface EnvironmentReport {
  ok: boolean
  checks: EnvironmentCheck[]
}

export interface PlatformAdapter {
  checkEnvironment(): Promise<EnvironmentReport>
  boot(device?: string): Promise<void>
  install(appPath: string): Promise<void>
  launch(bundleId: string): Promise<void>
  screenshot(): Promise<{ data: string; mimeType: string }>
  tap(point: Point): Promise<void>
  swipe(from: Point, to: Point): Promise<void>
  logStream(callback: (line: string) => void): Promise<{ stop: () => void }>
  accessibilityTree(): Promise<string>
  teardown(): Promise<void>
}
