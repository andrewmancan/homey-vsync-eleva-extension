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

## Recorded hardware validation

On 2026-10-16, an operator's automated deployment updated build
`d88e0374de701aa7f76744578ed0ead36c5749ba` (0.1.1). The selected Homey's API
reported 0.1.0 beforehand and 0.1.1 running/enabled afterward. The operator's
second deployment skipped the same healthy build. Devices/Flows and Homey access
returned after an ordinary host reboot, and physical fan commands worked.
This is evidence from one installation, not a claim about all supported drivers.

Open observations from that session:

- Fresh particulate readings after update/reboot were not explicitly confirmed.
- The purifier appeared Off rather than Auto. Physical power state versus a
  stale display was not established, and no cause was assigned to a Flow,
  deployment, or startup code.
- Abrupt power loss, long-duration operation and long-term token recovery were
  not exercised by that acceptance test.

To investigate the Off report, record physical power/mode, Homey's displayed
values and VeSync's values before and after a controlled app/host restart.
Check relevant Flows/schedules and sanitized command logs. Do not add a blanket
startup command forcing Auto; it could override an intentionally off device.
For sensor freshness, compare a newly retrieved sample and its timing against
VeSync after the polling interval; do not treat a cached reading as fresh just
because it looks plausible. Keep account/device identifiers out of public reports.
