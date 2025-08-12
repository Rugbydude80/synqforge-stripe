export type ContractType = 'irregular' | 'part_year' | 'fixed' | 'full_time';
export type ShiftStatus = 'draft' | 'published' | 'filled' | 'cancelled';
export type ShiftSource = 'rota' | 'sickness' | 'swap';
export type OfferStatus = 'sent' | 'accepted' | 'expired' | 'closed';

export interface EligibilityResult {
  pass: boolean;
  code: string;
  reason: string;
}

