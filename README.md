## Bitbucket to Github Migration

This app transfers all of your Bitbucket repositories to Github while maintaining their privacy status.

For each repository, the app will perform the following:

1. Clone all branches of the repository from Bitbucket;
1. Create the repository with the same name on GitHub;
1. Rename `master` branch to `main`;
1. Create a placeholder `master` branch with no history to avoid accidental
   pushes;
1. Push all branches to GitHub;
1. Grant write permissions for a team if the repository belongs to an
   organization and the GITHUB_TEAM environment variable is set;
1. Configure branch protection rules for the `main` branch and the placeholder
   `master` branch;
1. Archive the repository if it was last updated more than one year ago;
1. Delete repository on Bitbucket and set up a redirect notification with the new GitHub URL;

### Getting Started

This app includes a Docker configuration that automatically installs all required
dependencies.

**Important! Before starting the migration, review the `src/index.ts` file and
comment out the functions with the steps you don't wish to perform.**

1. Clone this repository:

    ```
    git clone https://github.com/the-vaan-group/bitbucket-to-github.git
    ```

1. In the repository folder, create an environment variable file from the
   template:

    ```
    cp -iv .env.template .env
    ```

1. Set the environment variables' values in the `.env` file.

1. Start the Docker container:

    ```
    ./docker-up.sh
    ```

1. After the Docker container is created, you should see the container's
   shell prompt. To start the migration type the following in the new shell
   prompt:

   ```
   npm run start
   ```

### Helpful links

[Create GitHub Personal Access token](https://github.com/settings/tokens/new)

### Prior art

- [https://github.com/pouriaa/bitbucket-to-github]()
