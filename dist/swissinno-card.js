const CARD_VERSION = "0.1.1";
const INTEGRATION = "swissinno_ble";
const UNIQUE_PREFIX = "swissinno_trap_";

const DEFAULT_CONFIG = Object.freeze({
  compact: false,
  show_rssi: true,
  show_last_seen: true,
  show_trigger_history: true,
});

const ENTITY_SUFFIXES = Object.freeze({
  battery: "_battery",
  rssi: "_rssi",
  last_seen: "_last_seen",
  last_triggered: "_last_triggered",
  trigger_count: "_trigger_count",
  reset: "_reset",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isSwissinnoStatusEntity(hass, entityId) {
  if (!entityId || !entityId.startsWith("binary_sensor.")) return false;

  const registry = hass?.entities?.[entityId];
  if (!registry) return false;
  if (registry.platform !== INTEGRATION) return false;

  const uniqueId = registry.unique_id ?? "";
  if (!uniqueId.startsWith(UNIQUE_PREFIX)) return true;

  return !Object.values(ENTITY_SUFFIXES).some((suffix) => uniqueId.endsWith(suffix));
}

function fireMoreInfo(element, entityId) {
  if (!entityId) return;
  element.dispatchEvent(
    new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    }),
  );
}

class SwissinnoCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = undefined;
    this._config = undefined;
    this._lastRenderKey = "";
    this._resetPending = false;
  }

  static getConfigElement() {
    return document.createElement("swissinno-card-editor");
  }

  static getStubConfig(hass, entities) {
    const candidates = Array.isArray(entities)
      ? entities
      : Object.keys(hass?.states ?? {});
    const entity = candidates.find((entityId) =>
      isSwissinnoStatusEntity(hass, entityId),
    );
    return entity ? { entity } : {};
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid configuration");
    }
    if (!config.entity) {
      throw new Error("Choose a SWISSINNO trap status entity");
    }
    if (!String(config.entity).startsWith("binary_sensor.")) {
      throw new Error("entity must be a binary_sensor");
    }

    this._config = { ...DEFAULT_CONFIG, ...config };
    this._lastRenderKey = "";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    if (this._config?.compact) return 2;
    return this._config?.show_trigger_history === false ? 3 : 4;
  }

  getGridOptions() {
    return this._config?.compact
      ? { rows: 2, columns: 6, min_rows: 2, min_columns: 3 }
      : {
          rows: this._config?.show_trigger_history === false ? 3 : 4,
          columns: 6,
          min_rows: 3,
          min_columns: 3,
        };
  }

  _registryEntry(entityId) {
    return entityId ? this._hass?.entities?.[entityId] : undefined;
  }

  _deviceEntries() {
    const entry = this._registryEntry(this._config?.entity);
    if (!entry?.device_id || !this._hass?.entities) return [];
    return Object.values(this._hass.entities).filter(
      (candidate) => candidate.device_id === entry.device_id,
    );
  }

  _resolveRelatedEntity(kind) {
    const explicit = this._config?.[kind];
    if (explicit && this._hass?.states?.[explicit]) return explicit;

    const suffix = ENTITY_SUFFIXES[kind];
    if (!suffix) return undefined;

    const entry = this._deviceEntries().find((candidate) => {
      if (candidate.platform && candidate.platform !== INTEGRATION) return false;
      return candidate.unique_id?.startsWith(UNIQUE_PREFIX)
        && candidate.unique_id.endsWith(suffix)
        && this._hass?.states?.[candidate.entity_id];
    });
    if (entry) return entry.entity_id;

    // Compatibility fallback for frontends that do not expose unique_id.
    const sameDevice = this._deviceEntries().filter(
      (candidate) => this._hass?.states?.[candidate.entity_id],
    );
    const fallbackMatchers = {
      battery: ["battery", "batter"],
      rssi: ["rssi", "signal"],
      last_seen: ["last_seen", "last seen", "senast sedd"],
      last_triggered: [
        "last_triggered",
        "last triggered",
        "last event",
        "senast utlöst",
        "senaste fällhändelse",
        "senaste fallhandelse",
        "senaste slag",
      ],
      trigger_count: [
        "trigger_count",
        "trigger count",
        "trap events",
        "antal utlösningar",
        "antal utlosningar",
        "fällhändelser",
        "fallhandelser",
        "antal slag",
        "slag",
      ],
      reset: ["reset", "aterstall", "återställ"],
    };
    return sameDevice.find((candidate) => {
      const haystack = `${candidate.entity_id} ${this._hass.states[candidate.entity_id]?.attributes?.friendly_name ?? ""}`.toLowerCase();
      return fallbackMatchers[kind].some((needle) => haystack.includes(needle));
    })?.entity_id;
  }

  _formatState(entityId) {
    const stateObj = this._hass?.states?.[entityId];
    if (!stateObj) return "—";
    try {
      return this._hass.formatEntityState?.(stateObj)
        ?? `${stateObj.state}${stateObj.attributes?.unit_of_measurement ? ` ${stateObj.attributes.unit_of_measurement}` : ""}`;
    } catch (_error) {
      return `${stateObj.state}${stateObj.attributes?.unit_of_measurement ? ` ${stateObj.attributes.unit_of_measurement}` : ""}`;
    }
  }

  _entityLabel(entityId, fallback) {
    const stateObj = this._hass?.states?.[entityId];
    if (!stateObj) return fallback;
    try {
      return this._hass.formatEntityName?.(stateObj, { type: "entity" })
        ?? stateObj.attributes?.friendly_name
        ?? fallback;
    } catch (_error) {
      return stateObj.attributes?.friendly_name ?? fallback;
    }
  }

  _deviceName(statusState) {
    if (this._config?.name) return this._config.name;
    try {
      const formatted = this._hass?.formatEntityName?.(statusState, { type: "device" });
      if (formatted) return formatted;
    } catch (_error) {
      // Fall through to state attributes.
    }

    const friendly = statusState?.attributes?.friendly_name;
    if (friendly) {
      return friendly
        .replace(/\s+(trap\s+)?status$/i, "")
        .replace(/\s+(fäll)?status$/i, "");
    }
    return "SWISSINNO Trap";
  }

  _deviceSubtitle() {
    const entry = this._registryEntry(this._config?.entity);
    const model = entry?.device_id ? this._hass?.devices?.[entry.device_id]?.model : undefined;
    return model || "SWISSINNO BLE";
  }

  _relativeTimestamp(entityId) {
    const stateObj = this._hass?.states?.[entityId];
    if (!stateObj || ["unknown", "unavailable"].includes(stateObj.state)) {
      return this._formatState(entityId);
    }

    const timestamp = Date.parse(stateObj.state);
    if (!Number.isFinite(timestamp)) return this._formatState(entityId);

    const seconds = Math.round((timestamp - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    let value = seconds;
    let unit = "second";

    if (abs >= 86400) {
      value = Math.round(seconds / 86400);
      unit = "day";
    } else if (abs >= 3600) {
      value = Math.round(seconds / 3600);
      unit = "hour";
    } else if (abs >= 60) {
      value = Math.round(seconds / 60);
      unit = "minute";
    }

    try {
      return new Intl.RelativeTimeFormat(
        this._hass?.language || navigator.language,
        { numeric: "auto", style: "short" },
      ).format(value, unit);
    } catch (_error) {
      return this._formatState(entityId);
    }
  }

  _detailHtml(entityId, icon, fallbackLabel, valueOverride) {
    if (!entityId) return "";
    const stateObj = this._hass?.states?.[entityId];
    if (!stateObj) return "";
    const label = this._entityLabel(entityId, fallbackLabel);
    const value = valueOverride ?? this._formatState(entityId);

    return `
      <button class="detail" data-more-info="${escapeHtml(entityId)}" type="button">
        <ha-icon icon="${icon}"></ha-icon>
        <span class="detail-text">
          <span class="detail-label">${escapeHtml(label)}</span>
          <span class="detail-value">${escapeHtml(value)}</span>
        </span>
      </button>
    `;
  }

  _render() {
    if (!this.shadowRoot || !this._hass || !this._config) return;

    const statusState = this._hass.states?.[this._config.entity];
    if (!statusState) {
      this.shadowRoot.innerHTML = `
        <style>${SwissinnoCard.styles}</style>
        <ha-card class="missing"><div class="error">Entity ${escapeHtml(this._config.entity)} not found.</div></ha-card>
      `;
      return;
    }

    const battery = this._resolveRelatedEntity("battery");
    const rssi = this._config.show_rssi ? this._resolveRelatedEntity("rssi") : undefined;
    const lastSeen = this._config.show_last_seen ? this._resolveRelatedEntity("last_seen") : undefined;
    const lastTriggered = this._config.show_trigger_history ? this._resolveRelatedEntity("last_triggered") : undefined;
    const triggerCount = this._config.show_trigger_history ? this._resolveRelatedEntity("trigger_count") : undefined;
    const reset = this._resolveRelatedEntity("reset");

    const state = statusState.state;
    const statusClass = state === "on"
      ? "caught"
      : state === "off"
        ? "ready"
        : "unavailable";
    const statusText = this._formatState(this._config.entity);
    const name = this._deviceName(statusState);
    const subtitle = this._deviceSubtitle();

    const renderKey = JSON.stringify({
      entity: this._config.entity,
      state,
      statusText,
      name,
      subtitle,
      battery: battery ? this._hass.states[battery]?.state : null,
      rssi: rssi ? this._hass.states[rssi]?.state : null,
      lastSeen: lastSeen ? this._hass.states[lastSeen]?.state : null,
      lastTriggered: lastTriggered ? this._hass.states[lastTriggered]?.state : null,
      triggerCount: triggerCount ? this._hass.states[triggerCount]?.state : null,
      reset,
      resetPending: this._resetPending,
      compact: this._config.compact,
      showRssi: this._config.show_rssi,
      showLastSeen: this._config.show_last_seen,
      showTriggerHistory: this._config.show_trigger_history,
      language: this._hass.language,
    });
    if (renderKey === this._lastRenderKey) return;
    this._lastRenderKey = renderKey;

    const details = [
      this._detailHtml(battery, "mdi:battery", "Battery"),
      this._detailHtml(rssi, "mdi:signal", "Signal strength"),
      this._detailHtml(
        lastSeen,
        "mdi:clock-outline",
        "Last seen",
        lastSeen ? this._relativeTimestamp(lastSeen) : undefined,
      ),
    ].filter(Boolean).join("");

    const historyDetails = [
      this._detailHtml(triggerCount, "mdi:counter", "Trigger count"),
      this._detailHtml(
        lastTriggered,
        "mdi:clock-alert-outline",
        "Last triggered",
        lastTriggered ? this._relativeTimestamp(lastTriggered) : undefined,
      ),
    ].filter(Boolean).join("");

    const resetButton = reset
      ? `<button class="reset-button" type="button" data-reset="${escapeHtml(reset)}" ${this._resetPending ? "disabled" : ""}>
          <ha-icon icon="mdi:restart"></ha-icon>
          <span>${this._resetPending ? "Resetting…" : escapeHtml(this._entityLabel(reset, "Reset trap"))}</span>
        </button>`
      : "";

    this.shadowRoot.innerHTML = `
      <style>${SwissinnoCard.styles}</style>
      <ha-card class="card ${statusClass} ${this._config.compact ? "compact" : ""}">
        <div class="status-accent"></div>
        <button class="header" type="button" data-more-info="${escapeHtml(this._config.entity)}">
          <span class="trap-icon"><ha-icon icon="mdi:rodent"></ha-icon></span>
          <span class="title-wrap">
            <span class="title">${escapeHtml(name)}</span>
            <span class="subtitle">${escapeHtml(subtitle)}</span>
          </span>
          <span class="status-pill"><span class="status-dot"></span>${escapeHtml(statusText)}</span>
        </button>
        ${details ? `<div class="details">${details}</div>` : ""}
        ${historyDetails ? `<div class="history">${historyDetails}</div>` : ""}
        ${resetButton ? `<div class="actions">${resetButton}</div>` : ""}
      </ha-card>
    `;

    this.shadowRoot.querySelectorAll("[data-more-info]").forEach((element) => {
      element.addEventListener("click", () => fireMoreInfo(this, element.dataset.moreInfo));
    });

    const resetElement = this.shadowRoot.querySelector("[data-reset]");
    if (resetElement) {
      resetElement.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (this._resetPending) return;
        this._resetPending = true;
        this._lastRenderKey = "";
        this._render();
        try {
          await this._hass.callService("button", "press", {
            entity_id: resetElement.dataset.reset,
          });
        } finally {
          this._resetPending = false;
          this._lastRenderKey = "";
          this._render();
        }
      });
    }
  }

  static get styles() {
    return `
      :host {
        display: block;
      }

      * {
        box-sizing: border-box;
      }

      .card {
        position: relative;
        overflow: hidden;
        color: var(--primary-text-color);
        background: var(--ha-card-background, var(--card-background-color, white));
        border-radius: var(--ha-card-border-radius, 12px);
        border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color));
        box-shadow: var(--ha-card-box-shadow, none);
      }

      .status-accent {
        position: absolute;
        inset: 0 auto 0 0;
        width: 5px;
        background: var(--disabled-text-color);
      }

      .ready .status-accent {
        background: var(--success-color, #43a047);
      }

      .caught .status-accent {
        background: var(--error-color, #db4437);
      }

      .header {
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 16px 16px 12px 18px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .trap-icon {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        flex: none;
        border-radius: 50%;
        background: color-mix(in srgb, var(--primary-color) 12%, transparent);
        color: var(--primary-color);
      }

      .trap-icon ha-icon {
        --mdc-icon-size: 23px;
      }

      .title-wrap {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 2px;
      }

      .title {
        overflow: hidden;
        font-size: 16px;
        font-weight: 600;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .subtitle {
        overflow: hidden;
        color: var(--secondary-text-color);
        font-size: 12px;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 140px;
        padding: 5px 9px;
        border-radius: 999px;
        color: var(--secondary-text-color);
        background: color-mix(in srgb, var(--disabled-text-color) 14%, transparent);
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
      }

      .ready .status-pill {
        color: var(--success-color, #2e7d32);
        background: color-mix(in srgb, var(--success-color, #43a047) 12%, transparent);
      }

      .caught .status-pill {
        color: var(--error-color, #c62828);
        background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
      }

      .status-dot {
        width: 7px;
        height: 7px;
        flex: none;
        border-radius: 50%;
        background: currentColor;
      }

      .details,
      .history {
        display: grid;
        gap: 8px;
        padding: 0 16px 12px 18px;
      }

      .details {
        grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
      }

      .history {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }

      .detail {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 10px 11px;
        border: 1px solid transparent;
        border-radius: 10px;
        background: color-mix(in srgb, var(--secondary-text-color) 7%, transparent);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .history .detail {
        border-color: var(--divider-color);
        background: transparent;
      }

      .detail:hover,
      .header:hover {
        background-color: color-mix(in srgb, var(--primary-text-color) 4%, transparent);
      }

      .detail ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
        color: var(--secondary-text-color);
      }

      .detail-text {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 2px;
      }

      .detail-label {
        overflow: hidden;
        color: var(--secondary-text-color);
        font-size: 11px;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .detail-value {
        overflow: hidden;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        padding: 0 16px 16px 18px;
      }

      .reset-button {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 8px 11px;
        border: 1px solid var(--divider-color);
        border-radius: 9px;
        color: var(--primary-text-color);
        background: transparent;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }

      .reset-button:hover:not(:disabled) {
        background: color-mix(in srgb, var(--primary-text-color) 4%, transparent);
      }

      .reset-button:disabled {
        opacity: .6;
        cursor: default;
      }

      .reset-button ha-icon {
        --mdc-icon-size: 17px;
      }

      .compact .header {
        padding-bottom: 8px;
      }

      .compact .details,
      .compact .history {
        display: none;
      }

      .compact .actions {
        padding-top: 0;
      }

      .missing {
        padding: 16px;
      }

      .error {
        color: var(--error-color);
      }

      @media (max-width: 420px) {
        .header {
          grid-template-columns: auto minmax(0, 1fr);
        }

        .status-pill {
          grid-column: 2;
          justify-self: start;
        }
      }
    `;
  }
}

class SwissinnoCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = undefined;
    this._config = undefined;
    this._lastRenderKey = "";
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
    this._lastRenderKey = "";
    this._render();
  }

  _changed(patch) {
    this._config = { ...this._config, ...patch };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config: this._config },
      }),
    );
    this._lastRenderKey = "";
    this._render();
  }

  _render() {
    if (!this.shadowRoot || !this._hass || !this._config) return;

    const renderKey = JSON.stringify({
      entity: this._config.entity,
      name: this._config.name,
      compact: this._config.compact,
      show_rssi: this._config.show_rssi,
      show_last_seen: this._config.show_last_seen,
      show_trigger_history: this._config.show_trigger_history,
      language: this._hass.language,
      entityCount: Object.keys(this._hass.states ?? {}).length,
    });
    if (renderKey === this._lastRenderKey) return;
    this._lastRenderKey = renderKey;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .editor { display: grid; gap: 14px; padding: 4px 0; }
        .row { display: grid; gap: 6px; }
        label { color: var(--primary-text-color); font-size: 13px; font-weight: 500; }
        input {
          width: 100%;
          padding: 10px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          color: var(--primary-text-color);
          background: var(--card-background-color);
          font: inherit;
        }
        .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .hint { color: var(--secondary-text-color); font-size: 12px; line-height: 1.4; }
      </style>
      <div class="editor">
        <div class="row">
          <label>Trap status entity</label>
          <ha-entity-picker id="entity" allow-custom-entity></ha-entity-picker>
          <span class="hint">Choose the SWISSINNO trap status. Related entities are detected automatically from the same device.</span>
        </div>
        <div class="row">
          <label for="name">Name (optional)</label>
          <input id="name" type="text" value="${escapeHtml(this._config.name ?? "")}" placeholder="Use device name">
        </div>
        <div class="toggle-row"><label>Compact</label><ha-switch id="compact"></ha-switch></div>
        <div class="toggle-row"><label>Show signal strength</label><ha-switch id="show_rssi"></ha-switch></div>
        <div class="toggle-row"><label>Show last seen</label><ha-switch id="show_last_seen"></ha-switch></div>
        <div class="toggle-row"><label>Show trigger history</label><ha-switch id="show_trigger_history"></ha-switch></div>
      </div>
    `;

    const picker = this.shadowRoot.querySelector("#entity");
    picker.hass = this._hass;
    picker.value = this._config.entity ?? "";
    picker.includeDomains = ["binary_sensor"];
    picker.addEventListener("value-changed", (event) => {
      if (event.detail?.value) this._changed({ entity: event.detail.value });
    });

    const name = this.shadowRoot.querySelector("#name");
    name.addEventListener("change", (event) => {
      const value = event.target.value.trim();
      const next = { ...this._config };
      if (value) next.name = value;
      else delete next.name;
      this._config = next;
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          bubbles: true,
          composed: true,
          detail: { config: next },
        }),
      );
    });

    for (const key of ["compact", "show_rssi", "show_last_seen", "show_trigger_history"]) {
      const toggle = this.shadowRoot.querySelector(`#${key}`);
      toggle.checked = Boolean(this._config[key]);
      toggle.addEventListener("change", (event) => {
        this._changed({ [key]: Boolean(event.target.checked) });
      });
    }
  }
}

if (!customElements.get("swissinno-card")) {
  customElements.define("swissinno-card", SwissinnoCard);
}
if (!customElements.get("swissinno-card-editor")) {
  customElements.define("swissinno-card-editor", SwissinnoCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "swissinno-card")) {
  window.customCards.push({
    type: "swissinno-card",
    name: "SWISSINNO Trap Card",
    description: "Local trap status card for the SWISSINNO BLE Home Assistant integration.",
    preview: true,
    documentationURL: "https://github.com/unigas/swissinno-card",
    getEntitySuggestion: (hass, entityId) => {
      if (!isSwissinnoStatusEntity(hass, entityId)) return null;
      return {
        config: {
          type: "custom:swissinno-card",
          entity: entityId,
        },
      };
    },
  });
}

console.info(`%c SWISSINNO CARD %c v${CARD_VERSION} `, "color: white; background: #03a9f4; font-weight: 700;", "color: #03a9f4; background: transparent;");
