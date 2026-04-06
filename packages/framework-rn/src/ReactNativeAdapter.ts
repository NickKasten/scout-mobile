import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { request } from 'node:http'
import type { FrameworkAdapter, ProjectConfig } from '@scout-mobile/core'
import { ScoutEnvironmentError } from '@scout-mobile/core'

export class ReactNativeAdapter implements FrameworkAdapter {
  private config: ProjectConfig
  private metroPort: number

  constructor(config: ProjectConfig) {
    this.config = config
    this.metroPort = config.metroPort ?? 8081
  }

  getBundleId(): string {
    return this.config.bundleId
  }

  async build(): Promise<string> {
    const iosDir = join(this.config.projectRoot, 'ios')
    if (!existsSync(iosDir)) {
      throw new ScoutEnvironmentError(`ios/ directory not found in ${this.config.projectRoot}`)
    }

    const workspace = this.findWorkspace(iosDir)
    const scheme = this.config.scheme ?? this.guessScheme(workspace)
    const derivedDataPath = join(this.config.projectRoot, '.scout-derived-data')

    const args = [
      '-workspace', workspace,
      '-scheme', scheme,
      '-configuration', 'Debug',
      '-sdk', 'iphonesimulator',
      '-derivedDataPath', derivedDataPath,
      '-quiet',
      'build',
    ]

    execFileSync('xcodebuild', args, {
      stdio: 'ignore',
      timeout: 5 * 60 * 1000,
      cwd: this.config.projectRoot,
    })

    return this.findAppBundle(derivedDataPath)
  }

  async *getMetroLogs(): AsyncIterable<string> {
    const isRunning = await this.checkMetroRunning()
    if (!isRunning) {
      return
    }
    // Actual RN error capture happens via system log stream + analyzeLogLines
  }

  private findWorkspace(iosDir: string): string {
    const entries = readdirSync(iosDir)
    const workspace = entries.find((e) => e.endsWith('.xcworkspace'))
    if (!workspace) {
      throw new ScoutEnvironmentError(`No .xcworkspace found in ${iosDir}`)
    }
    return join(iosDir, workspace)
  }

  private guessScheme(workspacePath: string): string {
    const workspaceName = basename(workspacePath, '.xcworkspace')
    return workspaceName
  }

  private findAppBundle(derivedDataPath: string): string {
    const productsDir = join(derivedDataPath, 'Build', 'Products', 'Debug-iphonesimulator')
    if (!existsSync(productsDir)) {
      throw new ScoutEnvironmentError(`Build products not found at ${productsDir}`)
    }
    const entries = readdirSync(productsDir)
    const app = entries.find((e) => e.endsWith('.app'))
    if (!app) {
      throw new ScoutEnvironmentError(`No .app bundle found in ${productsDir}`)
    }
    return join(productsDir, app)
  }

  private checkMetroRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = request(
        { hostname: 'localhost', port: this.metroPort, path: '/status', timeout: 2000 },
        (res) => {
          res.resume()
          resolve(res.statusCode === 200)
        },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
      req.end()
    })
  }
}
