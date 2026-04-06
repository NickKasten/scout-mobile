export class ScoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScoutError'
  }
}

export class ScoutEnvironmentError extends ScoutError {
  constructor(message: string) {
    super(message)
    this.name = 'ScoutEnvironmentError'
  }
}

export class ScoutValidationError extends ScoutError {
  constructor(message: string) {
    super(message)
    this.name = 'ScoutValidationError'
  }
}
