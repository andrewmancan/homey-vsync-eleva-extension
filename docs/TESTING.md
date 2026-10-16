# Testing and troubleshooting

Automated tests cover discovery, sensor parsing, missing/invalid readings, command
payloads, API rejection, mode changes, Flow tokens, offline recovery and login
backoff. Python tests cover package provenance, hashes, archive paths and the
compiled runtime metadata used by the Homey CLI. CI rebuilds the compiled package
to catch accidental dependence on TypeScript source or host-native binaries.

For a new installation, compare Homey readings against VeSync after a minute.
Try manual levels 1 and 4, Auto, Sleep, display and child lock, observing the
purifier as well as the app. Close the development terminal and confirm later
readings continue. Record unsupported controls rather than repeatedly retrying.

After a later ordinary host restart, check that the app resumes and refreshes.
Do not create dust, smoke or other pollution to test the sensors. Small equal
values for PM1/2.5/10 can occur in clean air; they are cumulative particle size
classes, not independent measures of every allergen or gas.

If a release fails, disable the app while investigating; uninstalling removes its
devices. Install a previously working release with the same app ID and without
`--clean`. A process-running check alone does not prove fresh sensor data or
physical purifier operation. Do not report cached readings as live.
