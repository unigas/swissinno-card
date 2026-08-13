# Changelog

## 0.1.1

- Recognize the current Swedish `Antal slag` trigger-count label while retaining
  compatibility with the earlier `Slag` label.
- Synchronize the documentation and preview with `swissinno_ble` 1.0.30.
- Pin the upgraded official GitHub Actions to immutable release commits.

## 0.1.0

- Add automatic display of trigger history (`trigger_count` and `last_triggered`).
- Recognize the Swedish `Slag` / `Senaste slag` entity labels as compatibility fallbacks.
- Read the SWISSINNO model from the Home Assistant device registry when available.
- Keep compatibility fallbacks for older integration versions and localized entity names.
- Initial release.
- Automatic discovery of battery voltage, RSSI, last-seen and reset entities from the selected SWISSINNO trap device.
- Ready, caught and unavailable visual states.
- Reset control shown only when a reset entity exists.
- Compact layout option.
- Graphical card editor.
- Home Assistant 2026.6+ entity-card suggestion support.
- HACS Dashboard/plugin-compatible repository layout.
