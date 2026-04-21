export class CreateSponsoredSlotDto {
  companyId!: string
  slotType!: string   // maps to SponsoredSlotType enum
  startDate!: string  // ISO date → startsAt
  endDate!: string    // ISO date → endsAt
  priceCharged?: number
  notes?: string
}

export class UpdateSponsoredSlotDto {
  startDate?: string
  endDate?: string
  isActive?: boolean
  priceCharged?: number
  notes?: string
}
