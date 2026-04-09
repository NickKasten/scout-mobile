export interface Point {
  x: number
  y: number
}

export interface DeviceInfo {
  udid: string
  name: string
  width: number   // logical points (0 = unknown)
  height: number  // logical points (0 = unknown)
}

export interface BootResult extends DeviceInfo {
  warnings?: string[]
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

export interface AccessibilityElement {
  type: string                    // "Button", "TextField", "StaticText"
  name: string                    // accessibility label
  value?: string                  // current value for inputs
  frame: { x: number; y: number; width: number; height: number }
  children?: AccessibilityElement[]
}

export interface AccessibilityTree {
  elements: AccessibilityElement[]
  raw: string                     // full JSON for debugging
}

export interface LogStreamOptions {
  bundleId?: string
  processName?: string
}

export interface PlatformAdapter {
  checkEnvironment(): Promise<EnvironmentReport>
  boot(device?: string): Promise<BootResult>
  install(appPath: string): Promise<void>
  launch(bundleId: string): Promise<void>
  screenshot(options?: { delayMs?: number }): Promise<{ data: string; mimeType: string }>
  tap(point: Point): Promise<void>
  swipe(from: Point, to: Point): Promise<void>
  logStream(callback: (line: string) => void, options?: LogStreamOptions): Promise<{ stop: () => void }>
  typeText(text: string): Promise<void>
  pressKey(key: string): Promise<void>
  clearText(): Promise<void>
  tapElement(label: string): Promise<{ element: AccessibilityElement }>
  accessibilityTree(): Promise<AccessibilityTree>
  teardown(): Promise<void>
}
