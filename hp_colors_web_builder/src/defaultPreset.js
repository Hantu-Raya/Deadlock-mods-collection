import { HP_SCHEMA } from "./hpSchema.js";

export const DEFAULT_PRESET = {
  name: "Web Builder Preset",
  version: 1,
  values: Object.fromEntries(Object.entries(HP_SCHEMA).map(([key, spec]) => [key, spec.defaultValue]))
};
