export const HP_SCHEMA = {
  hp_enabled: { type: "boolean", defaultValue: true },
  hp_mode: { type: "number", defaultValue: 1, min: 0, max: 1 },
  hp_low_threshold: { type: "number", defaultValue: 30, min: 0, max: 100 },
  hp_high_threshold: { type: "number", defaultValue: 70, min: 0, max: 100 },
  hp_bg_visible: { type: "boolean", defaultValue: true },
  hp_team_colors: { type: "boolean", defaultValue: false },
  hp_skip_buildings: { type: "boolean", defaultValue: true },
  hp_color_low: { type: "color", defaultValue: "#E16161" },
  hp_color_mid: { type: "color", defaultValue: "#FF7B00" },
  hp_color_high: { type: "color", defaultValue: "#00FF00" },
  hp_pulse_enabled: { type: "boolean", defaultValue: true },
  hp_pulse_threshold: { type: "number", defaultValue: 25, min: 0, max: 100 },
  hp_pulse_bpm: { type: "number", defaultValue: 75, min: 20, max: 240 },
  hp_pulse_intensity: { type: "number", defaultValue: 1, min: 0, max: 2 },
  hp_pulse_hide_bar: { type: "boolean", defaultValue: false },
  hp_pulse_text_enabled: { type: "boolean", defaultValue: true },
  hp_pulse_text_scale: { type: "number", defaultValue: 1.45, min: 0.5, max: 3 },
  hp_counter_size: { type: "number", defaultValue: 145, min: 40, max: 260 },
  hp_counter_format: { type: "number", defaultValue: 0, min: 0, max: 2 },
  hp_text_color_mode: { type: "number", defaultValue: 0, min: 0, max: 2 },
  hp_text_color_low: { type: "color", defaultValue: "#FFFFFF" },
  hp_text_color_mid: { type: "color", defaultValue: "#FFFFFF" },
  hp_text_color_high: { type: "color", defaultValue: "#FFFFFF" },
  hp_friend_enabled: { type: "boolean", defaultValue: false },
  hp_friend_color_low: { type: "color", defaultValue: "#65D46E" },
  hp_friend_color_mid: { type: "color", defaultValue: "#65D46E" },
  hp_friend_color_high: { type: "color", defaultValue: "#65D46E" },
  hp_kill_zone_enabled: { type: "boolean", defaultValue: false },
  hp_kill_zone_threshold: { type: "number", defaultValue: 10, min: 0, max: 100 },
  hp_kill_zone_color: { type: "color", defaultValue: "#FF2222" },
  hp_kill_zone_width: { type: "number", defaultValue: 2, min: 1, max: 20 }
};

export function coerceHpValue(key, value) {
  const spec = HP_SCHEMA[key];
  if (!spec) return undefined;
  if (spec.type === "boolean") return !!value;
  if (spec.type === "color") {
    const color = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : spec.defaultValue;
  }
  if (spec.type === "number") {
    const num = Number(value);
    if (!Number.isFinite(num)) return spec.defaultValue;
    return Math.min(spec.max, Math.max(spec.min, num));
  }
  return value;
}
