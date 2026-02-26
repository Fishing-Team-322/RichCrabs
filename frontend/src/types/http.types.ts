export interface ApiEnvelope<T> {
  data: T
  error?: BusinessErrorDto
}

export interface BusinessErrorDto {
  code: string
  message: string
  details?: unknown
}

export interface HttpErrorDto {
  message: string
  status: number
  code?: string
  details?: unknown
}
