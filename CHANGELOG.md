# [4.0.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v3.1.0...v4.0.0) (2026-06-23)


### Features

* **tooling:** add ESLint, husky, and lint-staged ([#61](https://github.com/rmartz/vercel-deploy-scripts/issues/61)) ([a8aa237](https://github.com/rmartz/vercel-deploy-scripts/commit/a8aa23733df6fb8dacb87c0e6bb07af1535f2b03)), closes [#60](https://github.com/rmartz/vercel-deploy-scripts/issues/60)


### BREAKING CHANGES

* **tooling:** add ESLint, husky, and lint-staged (#61)

# [3.1.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v3.0.0...v3.1.0) (2026-05-07)


### Features

* include development env in public var sync and --init firebase ([#57](https://github.com/rmartz/vercel-deploy-scripts/issues/57)) ([367d561](https://github.com/rmartz/vercel-deploy-scripts/commit/367d561a51bc9585b60540dc552cc76dfeaa9c33))

# [3.0.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.4.0...v3.0.0) (2026-05-07)


### chore

* remove Terraform template and init-terraform script ([#56](https://github.com/rmartz/vercel-deploy-scripts/issues/56)) ([40cc1ec](https://github.com/rmartz/vercel-deploy-scripts/commit/40cc1ec4ab8ce310a799dbc0c038d8cd395dd461))


### BREAKING CHANGES

* remove Terraform template and init-terraform script (#56)

# [2.4.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.3.3...v2.4.0) (2026-05-07)


### Features

* add --refresh-previews flag to redeploy PR preview deployments after key rotation ([#53](https://github.com/rmartz/vercel-deploy-scripts/issues/53)) ([67bdd90](https://github.com/rmartz/vercel-deploy-scripts/commit/67bdd90ff59c635bbbff950184a936cc8e594e43))

## [2.3.3](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.3.2...v2.3.3) (2026-05-06)


### Bug Fixes

* detect --init targets from local YAML instead of Vercel env vars ([#50](https://github.com/rmartz/vercel-deploy-scripts/issues/50)) ([dcd0c57](https://github.com/rmartz/vercel-deploy-scripts/commit/dcd0c576aa447ff2c22401c803440f547ad99ff2))

## [2.3.2](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.3.1...v2.3.2) (2026-05-06)


### Bug Fixes

* ship prebuilt dist/ and remove prepare lifecycle script ([#52](https://github.com/rmartz/vercel-deploy-scripts/issues/52)) ([2696388](https://github.com/rmartz/vercel-deploy-scripts/commit/2696388170abde822c4134aa137d7e8cc30a91a4))

## [2.3.1](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.3.0...v2.3.1) (2026-05-06)


### Bug Fixes

* scope --init key-existence check to the specific Vercel target ([#51](https://github.com/rmartz/vercel-deploy-scripts/issues/51)) ([f76dafd](https://github.com/rmartz/vercel-deploy-scripts/commit/f76dafda8c514fa4ba890401762444293ad6e78f))

# [2.3.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.2.0...v2.3.0) (2026-05-06)


### Features

* auto-detect what to initialize when --init is passed without a service argument ([#49](https://github.com/rmartz/vercel-deploy-scripts/issues/49)) ([b693ec1](https://github.com/rmartz/vercel-deploy-scripts/commit/b693ec132a881e4738fee5f1700fb629dfa6e14d)), closes [#48](https://github.com/rmartz/vercel-deploy-scripts/issues/48)

# [2.2.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.1.2...v2.2.0) (2026-05-05)


### Features

* fall back to Vercel CLI auth token when VERCEL_TOKEN is unset ([#46](https://github.com/rmartz/vercel-deploy-scripts/issues/46)) ([a9fbf8e](https://github.com/rmartz/vercel-deploy-scripts/commit/a9fbf8ef5ae4f3b1b7e21e078d59c1c3b637f3b7))

## [2.1.2](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.1.1...v2.1.2) (2026-05-04)


### Bug Fixes

* support nested variables: YAML format in parseDeploymentEnv ([#47](https://github.com/rmartz/vercel-deploy-scripts/issues/47)) ([84df598](https://github.com/rmartz/vercel-deploy-scripts/commit/84df59876b3a2a699f0b3850a5b5f8cf6a2018e0)), closes [#48](https://github.com/rmartz/vercel-deploy-scripts/issues/48)

## [2.1.1](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.1.0...v2.1.1) (2026-05-04)


### Bug Fixes

* surface Vercel API errors as clean FatalError messages ([843c3bf](https://github.com/rmartz/vercel-deploy-scripts/commit/843c3bfe555d5464529bab0d0f8efa8cbefd04a9))

# [2.1.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v2.0.0...v2.1.0) (2026-05-04)


### Features

* read Firebase/Sentry config from deployment YAML in sync-env ([971d3ec](https://github.com/rmartz/vercel-deploy-scripts/commit/971d3ec931d8586e42c9604423b40722b824d0a5))

# [2.0.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.8.0...v2.0.0) (2026-05-04)


### Bug Fixes

* support feat!: breaking change syntax in semantic-release ([#33](https://github.com/rmartz/vercel-deploy-scripts/issues/33)) ([e97159a](https://github.com/rmartz/vercel-deploy-scripts/commit/e97159ae5a9df9d7f74906d0c5032fca94ade250)), closes [#32](https://github.com/rmartz/vercel-deploy-scripts/issues/32)


### Features

* make sync-env the sole public entrypoint ([#32](https://github.com/rmartz/vercel-deploy-scripts/issues/32)) ([9fe261a](https://github.com/rmartz/vercel-deploy-scripts/commit/9fe261a7562f9e7f971ce617b19f0843133293ce)), closes [#31](https://github.com/rmartz/vercel-deploy-scripts/issues/31)


### BREAKING CHANGES

* make sync-env the sole public entrypoint (#32)

# [1.8.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.7.1...v1.8.0) (2026-05-04)


### Features

* add --init flag to rotate-keys for bootstrapping secrets into a fresh project ([#31](https://github.com/rmartz/vercel-deploy-scripts/issues/31)) ([db33f93](https://github.com/rmartz/vercel-deploy-scripts/commit/db33f93e55a9a7266b6568341b3f60dd4891ff98)), closes [#25](https://github.com/rmartz/vercel-deploy-scripts/issues/25)

## [1.7.1](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.7.0...v1.7.1) (2026-05-04)


### Bug Fixes

* replace shell built-in command -v with which in commandExists ([#30](https://github.com/rmartz/vercel-deploy-scripts/issues/30)) ([235898d](https://github.com/rmartz/vercel-deploy-scripts/commit/235898d03e19360f2990f2d5eb7aa4d5382c6f34))

# [1.7.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.6.0...v1.7.0) (2026-05-03)


### Features

* add --rotate-keys flag to sync-env for combined env sync and key rotation ([#28](https://github.com/rmartz/vercel-deploy-scripts/issues/28)) ([c78a7ff](https://github.com/rmartz/vercel-deploy-scripts/commit/c78a7ff936694e31628274600aa8881439927b12)), closes [#25](https://github.com/rmartz/vercel-deploy-scripts/issues/25)

# [1.6.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.5.0...v1.6.0) (2026-05-01)


### Features

* migrate sync-env and rotate-keys to TypeScript ([83f9f9b](https://github.com/rmartz/vercel-deploy-scripts/commit/83f9f9b6af256eff127be02ee21471eddf5d7bcd)), closes [#25](https://github.com/rmartz/vercel-deploy-scripts/issues/25)

# [1.5.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.4.0...v1.5.0) (2026-04-30)


### Features

* **sync-env:** read from Terraform deployment YAML instead of .env file ([#23](https://github.com/rmartz/vercel-deploy-scripts/issues/23)) ([b1a9352](https://github.com/rmartz/vercel-deploy-scripts/commit/b1a935200ef5218a285a312fc5037e94b19346a8))

# [1.4.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.3.1...v1.4.0) (2026-04-30)


### Features

* add sync-env script for upserting public env vars to Vercel ([#21](https://github.com/rmartz/vercel-deploy-scripts/issues/21)) ([84b1ccf](https://github.com/rmartz/vercel-deploy-scripts/commit/84b1ccf3b9a48adccca9747bb9760f23a83e760e))

## [1.3.1](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.3.0...v1.3.1) (2026-04-30)


### Bug Fixes

* pull from development environment in generate-local-env ([#20](https://github.com/rmartz/vercel-deploy-scripts/issues/20)) ([1ec2212](https://github.com/rmartz/vercel-deploy-scripts/commit/1ec2212eb3800434f7106d0b62b12825279aa3c5))

# [1.3.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.2.0...v1.3.0) (2026-04-30)


### Features

* add rotate-keys script for Firebase and Sentry key rotation ([#19](https://github.com/rmartz/vercel-deploy-scripts/issues/19)) ([dbeb161](https://github.com/rmartz/vercel-deploy-scripts/commit/dbeb1611d197b991fe024e0ee2845e8d93f3285c))

# [1.2.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.1.0...v1.2.0) (2026-04-29)


### Bug Fixes

* add install-deps input to secret-scan workflow ([#18](https://github.com/rmartz/vercel-deploy-scripts/issues/18)) ([f8395f9](https://github.com/rmartz/vercel-deploy-scripts/commit/f8395f906d92b0a0db5a49c56bbafc61532cf771))


### Features

* add automated test suite (BATS, gitleaks fixtures, YAML parsing) ([#17](https://github.com/rmartz/vercel-deploy-scripts/issues/17)) ([353d03a](https://github.com/rmartz/vercel-deploy-scripts/commit/353d03ae9ff72d5bf4c1287c825f2aab8734f3c9))

# [1.2.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.1.0...v1.2.0) (2026-04-29)


### Features

* add automated test suite (BATS, gitleaks fixtures, YAML parsing) ([#17](https://github.com/rmartz/vercel-deploy-scripts/issues/17)) ([353d03a](https://github.com/rmartz/vercel-deploy-scripts/commit/353d03ae9ff72d5bf4c1287c825f2aab8734f3c9))

# [1.1.0](https://github.com/rmartz/vercel-deploy-scripts/compare/v1.0.0...v1.1.0) (2026-04-28)

### Features

- add reusable secret-scan CI workflow ([#15](https://github.com/rmartz/vercel-deploy-scripts/issues/15)) ([196a3cf](https://github.com/rmartz/vercel-deploy-scripts/commit/196a3cf4e137ee775e727497476e8e7cf571a829)), closes [#6](https://github.com/rmartz/vercel-deploy-scripts/issues/6)

# 1.0.0 (2026-04-28)

### Bug Fixes

- bump Node to 22 in release workflow ([#16](https://github.com/rmartz/vercel-deploy-scripts/issues/16)) ([a47ae8f](https://github.com/rmartz/vercel-deploy-scripts/commit/a47ae8f45a78ebed5b5e7d98f7dc6b307aeae4cc))

### Features

- add base gitleaks config ([#12](https://github.com/rmartz/vercel-deploy-scripts/issues/12)) ([17a39ad](https://github.com/rmartz/vercel-deploy-scripts/commit/17a39ad6a5a97cf27e2b8a9d2b8bbec5484b4bd9)), closes [#4](https://github.com/rmartz/vercel-deploy-scripts/issues/4)
- implement generate-local-env script ([#10](https://github.com/rmartz/vercel-deploy-scripts/issues/10)) ([241e1ff](https://github.com/rmartz/vercel-deploy-scripts/commit/241e1ff56aada3f1eeffd30e7e92f54d368c023e)), closes [#2](https://github.com/rmartz/vercel-deploy-scripts/issues/2)
- implement secrets-check gitleaks wrapper ([#13](https://github.com/rmartz/vercel-deploy-scripts/issues/13)) ([57792f8](https://github.com/rmartz/vercel-deploy-scripts/commit/57792f867940378537c4663b3d0e845b594c2092)), closes [#3](https://github.com/rmartz/vercel-deploy-scripts/issues/3)
- initialize package scaffold ([9ea507e](https://github.com/rmartz/vercel-deploy-scripts/commit/9ea507e4b6da7e029ef3daf5d10d496fa1daa0c6))
- provide Terraform config templates for Vercel env var management ([9bd0326](https://github.com/rmartz/vercel-deploy-scripts/commit/9bd03266cfd66153d680023bf0a830e26082d21a)), closes [#7](https://github.com/rmartz/vercel-deploy-scripts/issues/7)
- set up semantic-release for automated versioning ([#11](https://github.com/rmartz/vercel-deploy-scripts/issues/11)) ([ff72465](https://github.com/rmartz/vercel-deploy-scripts/commit/ff72465dbf348d41407f30a0fc2d7714cc630035)), closes [#5](https://github.com/rmartz/vercel-deploy-scripts/issues/5)

# Changelog
