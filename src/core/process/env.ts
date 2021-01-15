import j from 'joi'
import * as z from 'zod'

export const zodEnvSchema = z.object({
  BITBUCKET_WORKSPACE: z.string(),
  BITBUCKET_USERNAME: z.string(),
  BITBUCKET_PASSWORD: z.string(),
  GITHUB_WORKSPACE: z.string(),
  GITHUB_USERNAME: z.string(),
  GITHUB_TOKEN: z.string(),
  GITHUB_TEAM: z.string()
})

export const githubTeamSchema = j
  .string()
  .empty('')
  .trim()
  .optional()
  .default('NONE')

export const joiEnvSchema = j
  .object()
  .label('Environment variables')
  .keys({
    BITBUCKET_WORKSPACE: j.string().trim(),
    BITBUCKET_USERNAME: j.string().trim(),
    BITBUCKET_PASSWORD: j.string(),
    GITHUB_WORKSPACE: j.string().trim(),
    GITHUB_USERNAME: j.string().trim(),
    GITHUB_TOKEN: j.string(),
    GITHUB_TEAM: githubTeamSchema
  })
  .preferences({ presence: 'required', stripUnknown: true })

export type Env = z.infer<typeof zodEnvSchema>

export const getEnv = function (rawEnv = process.env): Env {
  const { value: validatedEnv, error: joiErr } = joiEnvSchema.validate(rawEnv)

  if (joiErr) {
    throw joiErr
  }

  return zodEnvSchema.parse(validatedEnv)
}
