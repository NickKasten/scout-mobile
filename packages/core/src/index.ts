export { ScoutError, ScoutEnvironmentError, ScoutValidationError } from './errors.js'
export {
  validateBundleId,
  validateDeviceName,
  validateFlowName,
  safeResolvePath,
} from './validation.js'
export type {
  PlatformAdapter,
  EnvironmentReport,
  EnvironmentCheck,
  Point,
} from './adapters/PlatformAdapter.js'
export type {
  FrameworkAdapter,
  ProjectConfig,
} from './adapters/FrameworkAdapter.js'
export { createScoutServer } from './server.js'
export {
  generateReport,
  generateSummary,
  writeReport,
  ensureGitignore,
} from './report/reportWriter.js'
export type { Issue, Severity, TestReport } from './report/reportWriter.js'
export { runTestLoop, analyzeLogLines } from './loop/testLoop.js'
export type { TestLoopOptions, TestLoopResult } from './loop/testLoop.js'
