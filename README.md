# VeSync Eleva extension for Homey

[![CI](https://github.com/andrewmancan/homey-vsync-eleva-extension/actions/workflows/release.yml/badge.svg)](https://github.com/andrewmancan/homey-vsync-eleva-extension/actions/workflows/release.yml)

A community Homey SDK v3 app for the **Levoit Eleva 300X (LAP-C341S-WUSZ)**.
It adds particulate readings, both filter estimates, fan and mode controls, Flow
cards and automatic VeSync session recovery. It runs inside Homey Pro or Homey
Self-Hosted Server. It is not a separate Docker service.

This is a GPLv3 fork of [spkesDE/com.spkes.vesync](https://github.com/spkesDE/com.spkes.vesync),
based on commit `37b775ea56a94af3a93ca9f1f96b98f70948a6b4` (1.0.31).
Original authorship and [asset attributions](ATTRIBUTIONS.md) are retained.
This is an independent community preview, not an official Levoit or Athom app.

## Supported behavior

| Readings | Controls |
| --- | --- |
| PM1, PM2.5 and PM10 | Power; Auto, Sleep and Manual mode |
| HEPA and carbon filter life | Manual fan levels 1–4, including Turbo |
| Availability and last reported device state | Display, child lock, refresh |

Readings normally refresh every 60 seconds. Flow cards expose sensor changes,
threshold crossings and availability changes. Login recovery uses backoff;
credential failures are not retried continuously. The fan slider is a manual
preset, not measured RPM. Missing sensor values remain unknown rather than zero.

**Cloud connection required:** device communication uses the community VeSync
API implementation. This is not Matter or local LAN control. Manufacturer API
changes can break authentication. The inherited authentication does not support
2FA. No credentials are included in this repository or its releases.

The app does not implement AI sleep insights, filter resets, manufacturer
schedules or room-size settings. Inherited upstream drivers remain in the source,
but this fork's hardware validation is limited to Eleva.

## Install or update

Use Node.js 24 and the pinned Homey CLI. From this repository in PowerShell:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd ci --prefix tooling --ignore-scripts --no-audit --no-fund
.\tooling\node_modules\.bin\homey.cmd login
.\tooling\node_modules\.bin\homey.cmd select
.\tooling\node_modules\.bin\homey.cmd app install
```

On Linux, use `npm` and `tooling/node_modules/.bin/homey` instead.
Select your intended Homey. Pair the purifier with VeSync first, then add
**VeSync Eleva Preview → Eleva 300X (Preview)** in Homey.
Upgrading an existing installation should retain its devices and Flow references:
keep app ID `com.andrewmccann.vesync.eleva` and driver `eleva300x`, and do not
uninstall or use `--clean`. The fork does not replace the original VeSync app.

## Validation status

Version 0.1.0 was exercised on one Eleva with firmware `1.0.21(1.0.34)`:
particulate readings, both filters, fan level 2, Auto mode and display commands
were confirmed through Homey on 2026-10-16. Version 0.1.1 adds session recovery;
its automated checks pass, but prolonged operation and physical power-loss
recovery still need observation. See [testing](docs/TESTING.md).

## Development and releases

```powershell
npm.cmd test
py -3 -m unittest discover -s tests -p "test_*.py" -v
.\tooling\node_modules\.bin\homey.cmd app build
```

PRs run tests and build on GitHub-hosted runners with no household access.
A passing commit on `main` publishes an immutable `build-<full-commit-SHA>`
[release](https://github.com/andrewmancan/homey-vsync-eleva-extension/releases)
containing `eleva.tar.gz` and `release-manifest.json`. The latter records the
source commit, app ID/version and archive SHA-256. The archive contains the
compiled runtime and per-file checksums. App version and build ID are distinct:
behavior changes should increment the app version; every accepted commit has its
own build ID. No automatic Homey App Store publishing is configured.

An installation can select and verify a release without forking this repository.
Household settings, tokens, deployment runners and persistent Homey data belong
to the operator's private infrastructure, outside this public project.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [LICENSE](LICENSE).
