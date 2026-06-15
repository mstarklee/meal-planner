import { z } from 'zod'

export const onboardingSchema = z.object({
  householdName: z.string().trim().min(1, 'Household name is required'),
  displayName: z.string().trim().min(1, 'Your name is required'),
  kids: z.array(z.object({ name: z.string().trim().min(1, 'Kid name is required') })),
  target_calories: z.number().int().positive(),
  target_protein: z.number().int().positive(),
  target_fiber: z.number().int().positive(),
  evening_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
  morning_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
