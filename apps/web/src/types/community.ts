export interface CommunityImage {
  id: string
  cloudinaryId: string
  url: string
  sortOrder: number
  instagramHandle: string | null
  status: string
  user: { username: string }
}
