import Path from 'path'
import { Logger } from 'pino'

import * as z from 'zod'
import URI from 'urijs'
import got, { Got } from 'got'
import execa from 'execa'
import { from } from '@reactivex/ix-esnext-esm/asynciterable'
import {
  map,
  filter,
  delayEach,
  tap,
  take
} from '@reactivex/ix-esnext-esm/asynciterable/operators'

import { makeLogger } from './core/logger'
import {
  initEmergencyShutdown,
  initGracefulShutdown
} from './core/process/shutdown'
import { getEnv } from './core/process/env'
import { calcDifferenceInDays } from './core/date/difference-in-days'
import { stripControlCharacters } from './core/string/strip-control-characters'

import {
  BitbucketRepositoryInfo,
  makeBitbucketRepositoriesSource
} from './fetch-bitbucket-repositories'

interface PipelinePayloadA extends BitbucketRepositoryInfo {
  bitbucketClient: Got
  cwd: string
  existingSlugSuffix: string
  githubClient: Got
  isGithubOrg: boolean
  shouldBeArchived: boolean
  updatedDaysAgo: number
  logger: Logger
}

interface PipelinePayloadB extends PipelinePayloadA {
  githubHtmlUrl: string
}

const EXCLUDED_REPOSITORIES: string[] = []

const main = async function (): Promise<void> {
  const logger = makeLogger({
    name: 'bitbucket-to-github',
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
  })

  logger.debug('Setting up shutdown sequences')
  initEmergencyShutdown(logger)
  initGracefulShutdown(logger)

  logger.debug('Validating required environment variables')
  const env = getEnv()
  const {
    BITBUCKET_WORKSPACE,
    BITBUCKET_PASSWORD,
    BITBUCKET_USERNAME,
    GITHUB_WORKSPACE,
    GITHUB_USERNAME,
    GITHUB_TOKEN,
    GITHUB_TEAM
  } = env

  logger.debug('Setting up network request utility')
  const request = got.extend({
    hooks: {
      beforeError: [
        function (err) {
          let parsedBody = null
          const { response } = err

          if (response && response.body) {
            try {
              parsedBody =
                typeof response.body === 'string'
                  ? JSON.parse(response.body)
                  : typeof response.body === 'object'
                  ? response.body
                  : null
            } catch (e) {
              logger.trace(
                'Parsing error response body failed -- %s',
                e.message
              )
            }

            logger.error(
              {
                details: parsedBody ? parsedBody : response.body,
                payload: err.options.json
                  ? err.options.json
                  : typeof err.options.body === 'string'
                  ? err.options.body
                  : undefined,
                statusCode: response.statusCode
              },
              err.message
            )
          }

          return err
        }
      ]
    }
  })

  logger.info('Starting migrations')
  const source = makeBitbucketRepositoriesSource({
    BITBUCKET_WORKSPACE,
    BITBUCKET_USERNAME,
    BITBUCKET_PASSWORD,
    logger,
    request
  })

  const allReposCwd = Path.resolve(__dirname, '../repositories/')

  const initialData = from(source)

  const filteredData = initialData.pipe<BitbucketRepositoryInfo>(
    take(500),
    filter(function skipExcludedRepos(b) {
      const { slug } = b

      return !EXCLUDED_REPOSITORIES.includes(slug)
    }),
    delayEach(1000)
  )

  const results = filteredData.pipe(
    // Retrieve repository information from BitBucket
    map<BitbucketRepositoryInfo, PipelinePayloadA>(
      function retrieveRepositoryInfoFromBitbucket(b) {
        const { slug, updated_on } = b
        const cwd = Path.resolve(allReposCwd, slug)

        const isGithubOrg: boolean = GITHUB_WORKSPACE !== GITHUB_USERNAME

        const updatedDaysAgo: number = calcDifferenceInDays(updated_on)
        const shouldBeArchived: boolean = updatedDaysAgo >= 360

        const githubClient = request.extend({
          prefixUrl: 'https://api.github.com',
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`
          }
        })

        const bitbucketClient = request.extend({
          prefixUrl: 'https://api.bitbucket.org/2.0',
          username: BITBUCKET_USERNAME,
          password: BITBUCKET_PASSWORD
        })

        const existingSlugSuffix: string = URI(slug).suffix()

        return {
          ...b,
          bitbucketClient,
          cwd,
          existingSlugSuffix,
          githubClient,
          isGithubOrg,
          shouldBeArchived,
          updatedDaysAgo,
          logger: logger.child({ repository: slug })
        }
      }
    ),
    // Pull all branches from BitBucket
    tap(async function pullRepository(b) {
      const { cwd, existingSlugSuffix, logger: l, slug, updatedDaysAgo } = b

      const bitbucketPullUrl: string = URI('https://bitbucket.org')
        .segmentCoded([BITBUCKET_WORKSPACE, slug])
        .username(BITBUCKET_USERNAME)
        .password(BITBUCKET_PASSWORD)
        .suffix(
          existingSlugSuffix ? [existingSlugSuffix, 'git'].join('.') : 'git'
        )
        .toString()

      l.debug({ updatedDaysAgo }, 'Processing repository')
      l.trace({ path: cwd }, 'Removing existing repository folder')
      await execa('rm', ['-rf', cwd])

      l.debug('Cloning repository')
      await execa(
        'git',
        ['clone', '--quiet', '--bare', bitbucketPullUrl, slug],
        {
          cwd: allReposCwd
        }
      )

      l.debug('Converting bare repository to normal repository')
      await execa.command(
        `mv -f ${slug} /tmp/${slug}.bare && mkdir ${slug} && mv -f /tmp/${slug}.bare ${slug}/.git`,
        { cwd: allReposCwd, shell: true }
      )
      await execa('git', ['config', '--bool', 'core.bare', 'false'], { cwd })
      await execa('git', ['reset', '--quiet', '--hard'], { cwd })
    }),
    // Rename `master` branch to `main`
    tap(async function renameMasterToMain(b) {
      const { cwd, logger: l } = b

      const {
        stdout: rawMainBranchExists
      } = await execa.command(
        `git show-ref --verify --quiet refs/heads/main && echo 'YES' || echo 'NO'`,
        { cwd, shell: true }
      )

      const mainBranchExists: boolean = rawMainBranchExists.trim() === 'YES'

      if (mainBranchExists) {
        l.trace(
          'Skipping renaming `master` branch: `main` branch already exists'
        )
        return
      }

      const {
        stdout: rawMasterBranchExists
      } = await execa.command(
        `git show-ref --verify --quiet refs/heads/master && echo 'YES' || echo 'NO'`,
        { cwd, shell: true }
      )

      const masterBranchExists: boolean = rawMasterBranchExists.trim() === 'YES'

      if (!masterBranchExists) {
        l.trace('Skipping renaming `master` branch: branch does not exist')
        return
      }

      l.debug('Renaming `master` branch to `main`')
      await execa.command(
        `git branch -m master main \
              && git config user.email "${GITHUB_USERNAME}@example.com" \
              && git config user.name "${GITHUB_USERNAME}" \
              && git checkout --orphan master && git reset --quiet --hard && git clean -xdf --quiet \
              && echo "# Restricted branch name" > README.md \
              && git add README.md && git commit -m 'Initial commit' \
              && git checkout -f main`,
        { cwd, shell: true }
      )

      l.debug(`Branch renamed`)
    }),
    // Push all branches to GitHub
    map<PipelinePayloadA, PipelinePayloadB>(
      async function pushRepositoryToGithub(b) {
        const {
          cwd,
          existingSlugSuffix,
          githubClient,
          isGithubOrg,
          slug,
          description,
          is_private,
          logger: l
        } = b

        l.debug('Creating repository on GitHub')
        const apiUrl = isGithubOrg
          ? URI().segmentCoded(['orgs', GITHUB_WORKSPACE, 'repos']).toString()
          : URI().segmentCoded(['user', 'repos']).toString()

        const { html_url: rawGithubHtmlUrl } = await githubClient({
          url: apiUrl,
          method: 'POST',
          json: {
            name: slug,
            private: is_private,
            description: stripControlCharacters(description)
          }
        }).json()

        const githubHtmlUrl: string = z.string().parse(rawGithubHtmlUrl)

        l.debug('Pushing all branches to GitHub')
        const githubPushUrl: string = URI(githubHtmlUrl)
          .username(GITHUB_USERNAME)
          .password(GITHUB_TOKEN)
          .suffix(
            existingSlugSuffix ? [existingSlugSuffix, 'git'].join('.') : 'git'
          )
          .toString()

        await execa('git', ['push', '--quiet', '--mirror', githubPushUrl], {
          cwd
        })

        l.debug('All branches pushed to GitHub')

        return { ...b, githubHtmlUrl }
      }
    ),
    // Grant team write permissions (organization-owned repositories only)
    tap(async function grantTeamWritePermissions(b) {
      const { githubClient, isGithubOrg, logger: l, slug } = b

      if (!isGithubOrg) {
        l.trace(
          { workspace: GITHUB_WORKSPACE, user: GITHUB_USERNAME },
          'Skipping team permissions step: not an organization'
        )
        return
      }

      const hasTeam: boolean = Boolean(GITHUB_TEAM) && GITHUB_TEAM !== 'NONE'

      if (!hasTeam) {
        l.trace(
          { team: GITHUB_TEAM },
          'Skipping team permissions step: no team name'
        )
        return
      }

      l.debug(
        {
          workspace: GITHUB_WORKSPACE,
          team: GITHUB_TEAM
        },
        'Granting write permissions to the team'
      )

      await githubClient({
        url: URI()
          .segmentCoded([
            'orgs',
            GITHUB_WORKSPACE,
            'teams',
            GITHUB_TEAM,
            'repos',
            GITHUB_WORKSPACE,
            slug
          ])
          .toString(),
        method: 'PUT',
        json: { permission: 'push' }
      }).json()

      l.debug({ team: GITHUB_TEAM }, 'Write permissions granted')
    }),
    // Protect primary branches
    tap(async function protectBranches(b) {
      const { logger: l, githubClient, isGithubOrg, slug } = b

      if (!isGithubOrg) {
        l.trace(
          'Skipping creating branch protection rules: repository not owned by organization'
        )
        return
      }

      const branches = await githubClient({
        url: URI()
          .segmentCoded(['repos', GITHUB_WORKSPACE, slug, 'branches'])
          .toString(),
        method: 'GET',
        searchParams: {
          per_page: 100
        }
      }).json()

      const mainBranchExists: boolean =
        Array.isArray(branches) &&
        branches.findIndex(function (branch) {
          return typeof branch === 'object' && branch.name === 'main'
        }) > -1

      if (mainBranchExists) {
        l.debug('Configuring protection rules for `main` branch')
        await githubClient({
          url: URI()
            .segmentCoded([
              'repos',
              GITHUB_WORKSPACE,
              slug,
              'branches',
              'main',
              'protection'
            ])
            .toString(),
          method: 'PUT',
          json: {
            required_status_checks: null,
            required_pull_request_reviews: null,
            restrictions: null,
            enforce_admins: true,
            allow_force_pushes: false,
            allow_deletions: false
          }
        }).json()
      } else {
        l.trace('Skipping protection for `main` branch: branch does not exist')
      }

      const masterBranchExists: boolean =
        Array.isArray(branches) &&
        branches.findIndex(function (branch) {
          return typeof branch === 'object' && branch.name === 'master'
        }) > -1

      if (masterBranchExists) {
        l.debug('Configuring protection rules for `master` branch')
        await githubClient({
          url: URI()
            .segmentCoded([
              'repos',
              GITHUB_WORKSPACE,
              slug,
              'branches',
              'master',
              'protection'
            ])
            .toString(),
          method: 'PUT',
          json: {
            required_status_checks: null,
            required_pull_request_reviews: null,
            restrictions: null,
            enforce_admins: true,
            allow_force_pushes: false,
            allow_deletions: true
          }
        }).json()
      } else {
        l.trace(
          'Skipping protection for `master` branch: branch does not exist'
        )
      }

      l.debug('Branch protection configured')
    }),
    // Archive repository
    tap(async function archiveRepo(b) {
      const { githubClient, logger: l, shouldBeArchived, slug, updated_on } = b

      if (!shouldBeArchived) {
        l.trace(
          { updated_on },
          'Skipping archiving step: the repository has been updated recently'
        )
        return
      }

      l.debug('Archiving repository')
      await githubClient
        .patch({
          url: URI().segmentCoded(['repos', GITHUB_WORKSPACE, slug]).toString(),
          json: { archived: true }
        })
        .json()

      l.debug('Repository archived')
    }),
    // Delete repository on BitBucket
    tap(async function deleteRepo(b) {
      const { bitbucketClient, githubHtmlUrl, logger: l, slug } = b

      l.debug('Deleting repository on BitBucket')
      await bitbucketClient({
        url: URI()
          .segmentCoded(['repositories', BITBUCKET_WORKSPACE, slug])
          .toString(),
        method: 'DELETE',
        searchParams: {
          redirect_to: githubHtmlUrl
        }
      }).json()

      l.debug('Repository archived')
    }),
    // Delete transient repository from disk
    tap(async function deleteRepoFromDisk(b) {
      const { logger: l, cwd } = b

      await execa('rm', ['-rf', cwd], { cwd: allReposCwd })

      l.debug('Repository files removed from disk')
    })
  )

  await results.forEach(function (b) {
    const { githubHtmlUrl, logger: l } = b
    l.info({ url: githubHtmlUrl }, 'Repository migrated')
  })

  logger.info('All repositories migrated successfully')
}

main().catch(function (err) {
  throw err
})
