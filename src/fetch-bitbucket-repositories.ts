import { Logger } from 'pino'
import { Got } from 'got'
import j from 'joi'
import * as z from 'zod'

export const joiRepoListResponseSchema = j
  .object()
  .keys({
    next: j.string().allow(null).optional(),
    page: j.number(),
    values: j.array().items(
      j.object().keys({
        name: j.string(),
        description: j.string().allow(''),
        slug: j.string(),
        is_private: j.boolean(),
        updated_on: j.string().isoDate()
      })
    )
  })
  .preferences({ presence: 'required', stripUnknown: true })

export const zodRepoListResponseSchema = z.object({
  next: z.string().optional().nullable(),
  page: z.number(),
  values: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      slug: z.string(),
      is_private: z.boolean(),
      updated_on: z.string()
    })
  )
})

export type ZodRepoListResponse = z.infer<typeof zodRepoListResponseSchema>

export type BitbucketRepositoryInfo = ZodRepoListResponse['values'][0]

export interface Params {
  BITBUCKET_WORKSPACE: string
  BITBUCKET_USERNAME: string
  BITBUCKET_PASSWORD: string
  logger: Logger
  request: Got
}

export const makeBitbucketRepositoriesSource = function (
  params: Params
): AsyncIterableIterator<BitbucketRepositoryInfo> {
  const {
    BITBUCKET_WORKSPACE,
    BITBUCKET_USERNAME,
    BITBUCKET_PASSWORD,
    logger,
    request
  } = params

  const baseSearchParams = {
    sort: 'updated_on'
  }

  return request.paginate.each<BitbucketRepositoryInfo, unknown>(
    `https://api.bitbucket.org/2.0/repositories/${BITBUCKET_WORKSPACE}`,
    {
      searchParams: { ...baseSearchParams, page: 1 },
      responseType: 'json',
      resolveBodyOnly: true,
      username: BITBUCKET_USERNAME,
      password: BITBUCKET_PASSWORD,
      pagination: {
        stackAllItems: false,
        transform: function (response) {
          const validated = zodRepoListResponseSchema.parse(
            j.attempt(response.body, joiRepoListResponseSchema)
          )

          return validated.values
        },
        paginate: function (response) {
          const body = zodRepoListResponseSchema.parse(
            j.attempt(response.body, joiRepoListResponseSchema)
          )

          if (!body.next) {
            return false
          }

          const nextPage: number = body.page + 1

          logger.debug('Fetching repo list page %d', nextPage)

          return {
            searchParams: { ...baseSearchParams, page: nextPage }
          }
        }
      }
    }
  )
}
