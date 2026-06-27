import { z } from 'zod'

export const memberSchema = z.object({
  name: z.string().trim().default(''),
  sex: z.enum(['male', 'female']),
  age: z.number().int().min(0).max(129),
  weight_kg: z.number().positive(),
  activity_level: z.enum(['sedentary', 'moderate', 'strength', 'fat_loss']),
})

export type MemberFormValue = z.infer<typeof memberSchema>

export const onboardingSchema = z.object({
  householdName: z.string().trim().min(1, 'Household name is required'),
  displayName: z.string().trim().min(1, 'Your name is required'),
  members: z.array(memberSchema).min(1, 'Add at least one family member'),
  evening_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
  morning_reminder_time: z.string().regex(/^\d{2}:\d{2}$/),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
