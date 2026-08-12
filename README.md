# SWISSINNO Trap Card

A compact Lovelace card for [`unigas/swissinno_ble`](https://github.com/unigas/swissinno_ble), the local Bluetooth integration for SWISSINNO Connect SuperCat and Electronic SuperCat traps.

![SWISSINNO Trap Card preview](docs/preview-history-sv.png)

## Features

- Ready / Caught / Unavailable status at a glance.
- Automatically discovers battery voltage, RSSI, Last seen, trigger history and Reset entities from the same Home Assistant device.
- Shows the number of recorded trap events and the most recent event when the integration exposes those sensors.
- Reset control appears only for trap families that expose a reset button.
- Uses Home Assistant entity formatting for localized state values and units.
- Relative Last seen display.
- Compact layout.
- Graphical card editor.
- Suggested under **Community** when selecting a compatible SWISSINNO status entity on Home Assistant 2026.6 or newer.
- No cloud dependency; the card consumes entities from the local `swissinno_ble` integration.

## Basic configuration

```yaml
type: custom:swissinno-card
entity: binary_sensor.your_trap_status
```

That is normally all that is required. The companion entities are resolved from the same Home Assistant device using the stable unique IDs created by `swissinno_ble`.

## Options

```yaml
type: custom:swissinno-card
entity: binary_sensor.your_trap_status
name: Garage mouse trap
compact: false
show_rssi: true
show_last_seen: true
show_trigger_history: true
```

If automatic discovery is unavailable, related entities can be overridden explicitly:

```yaml
type: custom:swissinno-card
entity: binary_sensor.your_trap_status
battery: sensor.your_trap_battery_voltage
rssi: sensor.your_trap_signal_strength
last_seen: sensor.your_trap_last_seen
last_triggered: sensor.your_trap_last_triggered
trigger_count: sensor.your_trap_trigger_count
reset: button.your_trap_reset
```

## Installation

### HACS

Add `https://github.com/unigas/swissinno-card` as a **Dashboard** custom repository in HACS and download **SWISSINNO Trap Card**.

### Manual installation

Copy `dist/swissinno-card.js` to your Home Assistant `www` directory, add it as a JavaScript module resource, and use `custom:swissinno-card` in a dashboard.

## Compatibility

Designed for the `swissinno_ble` integration and current Home Assistant frontend APIs. Entity suggestion support requires Home Assistant 2026.6 or later. Trigger history is optional and appears automatically when `last_triggered` / `trigger_count` are provided by the installed integration version. In the Swedish translation these entities are shown as **Senaste slag** and **Slag**.

## Related project

- [SWISSINNO BLE](https://github.com/unigas/swissinno_ble)

## Support

If this project is useful to you, you can support further testing and hardware work at [Buy Me a Coffee](https://www.buymeacoffee.com/unigas).

## License

MIT
