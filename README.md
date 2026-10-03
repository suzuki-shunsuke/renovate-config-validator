# renovate-config-validator

[renovate-config-validator](https://docs.renovatebot.com/config-validation/) bundled into a single file for fast installation.

```sh
npx --yes @suzuki-shunsuke/renovate-config-validator --strict renovate.json
```

`npx --package renovate renovate-config-validator` installs renovate and hundreds of dependencies (about 350 MB), which takes tens of seconds.
This package contains only one JavaScript file bundled with [esbuild](https://esbuild.github.io/) and an optional native dependency [re2](https://www.npmjs.com/package/re2), so it's installed in a few seconds.

## Versioning

The version of this package is the same as the version of renovate.
For instance, `@suzuki-shunsuke/renovate-config-validator@44.125.1` is built from `renovate@44.125.1`.

A GitHub Actions workflow checks new versions of renovate every hour and publishes them automatically.
Some versions may be skipped if multiple versions are released within an hour.

## How it works

The bundle is built from renovate's own entrypoint `dist/config-validator.js`, so the behaviour is the same as renovate-config-validator.
Some modules that renovate loads at runtime are replaced with static imports. See [scripts/build.mjs](scripts/build.mjs).

## Verification

Packages are published from GitHub Actions with [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

```sh
npm audit signatures
```

## License

This package is licensed under [AGPL-3.0-only](LICENSE) because it contains [renovate](https://github.com/renovatebot/renovate), which is licensed under AGPL-3.0-only.

The licenses of bundled packages are in `dist/THIRD_PARTY_LICENSES` of the published package.

### Corresponding source

The bundle is built from the following sources:

- renovate: <https://github.com/renovatebot/renovate> (the tag is the same as this package's version)
- Dependencies: `dist/package-lock.json` in the published package records the exact versions
- Build scripts: this repository
