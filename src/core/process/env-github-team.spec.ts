import test from 'ava'
import { githubTeamSchema } from './env'

test('GitHub Team Input Schema', async function (t) {
  t.is(
    await githubTeamSchema.validateAsync(undefined),
    'NONE',
    'should return NONE as default value'
  )

  t.is(
    await githubTeamSchema.validateAsync(''),
    'NONE',
    'should return NONE for empty string input'
  )

  t.is(
    await githubTeamSchema.validateAsync('engineering'),
    'engineering',
    'should validate input'
  )

  t.is(
    await githubTeamSchema.validateAsync('  engineering '),
    'engineering',
    'should trim leading and trailing whitespace'
  )

  await t.throwsAsync(
    async function () {
      await githubTeamSchema.validateAsync(null)
    },
    { message: /must be a string/i },
    'should not allow null value'
  )
})
