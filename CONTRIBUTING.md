# Contributing

Open an issue or PR with the exact model and firmware, the expected behavior,
and a minimal reproduction. Remove emails, tokens, MAC addresses, device IDs,
household names and raw account responses from logs and fixtures.

Run `npm ci --ignore-scripts`, `npm test`, and the Python package tests in the
README. Add a focused test for a new protocol response or a regression. Hardware
tests should state which model, command and physical response were checked.

Keep existing app and driver IDs stable. Do not add account data, environment
files, Homey backups or app-store credentials. New features must preserve the
GPLv3 license and upstream/asset attribution. Contributions are under this
repository's GPLv3 license. A maintainer reviews and merges changes; only passing
`main` commits produce releases. Source from contributor branches never runs on
a household self-hosted runner.

Future integrations can use their own repositories and app IDs. Keep this
repository focused on the VeSync/Eleva integration.
