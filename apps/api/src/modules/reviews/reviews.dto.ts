export class CreateReviewDto {
  bookId!: string
  rating!: number
  title?: string
  body!: string
  containsSpoilers?: boolean
}

export class UpdateReviewDto {
  rating?: number
  title?: string
  body?: string
  containsSpoilers?: boolean
}
