import { z } from 'zod';

export const TipsRow = z.object({
  day: z.string(),
  site: z.string(),
  serviceCharge: z.string(),
  cashTips: z.string(),
});

export const TimesheetRow = z.object({
  staffId: z.string(),
  date: z.string(),
  hours: z.string(),
  rate: z.string(),
});

export type TipsRow = z.infer<typeof TipsRow>;
export type TimesheetRow = z.infer<typeof TimesheetRow>;

