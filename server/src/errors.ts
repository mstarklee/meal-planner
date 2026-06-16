export class ImportError extends Error {
  status: number
  detail?: string
  constructor(message: string, status = 400, detail?: string) {
    super(message)
    this.name = 'ImportError'
    this.status = status
    this.detail = detail
  }
}
