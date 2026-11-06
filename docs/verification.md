# Verification

Initial snapshot: 2026-11-06, Windows x64.

- Strict TypeScript checking passed.
- Main, preload and renderer compiled successfully.
- 12 domain/storage tests passed using real temporary files.
- Native Windows smoke check: panel opened, note created, title/body edited,
  color changed, note hidden and reopened with its original text and color.
- A second independent note was created through the first note's plus button.
- JSON in the isolated test profile independently confirmed saved text, color,
  geometry and hidden state. No personal notes were accessed.
- Portable Windows x64 package generated. The unpacked executable was used for
  interaction checks; the portable launcher is not separately certified.

Tests cover independent note state, supported colors/font bounds, invalid input,
plain text retention, duplicate identifiers, date/bounds validation, disconnected
monitor geometry, persistence across store instances, concurrent text/geometry
updates, reversible hidden/trash state, failed transactions, corruption and backup.

Pending native acceptance includes prolonged simultaneous editing, save failure
and flush timeout UI, crash/OS shutdown behavior, tray accessibility, actual
multi-monitor disconnect, keyboard/zoom/accessibility audit, and end-to-end trash
restoration. Stored state tests do not establish every OS interaction.

The first npm install reported six moderate advisories in the development tool
chain. No runtime npm dependencies are declared. Keep Electron and packaging
tools reviewed; neither a successful build nor this snapshot is a security audit.
