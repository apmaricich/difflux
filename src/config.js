/**
 * Configuration file support for Difflux.
 * Reads JSON config from ~/.config/difflux/config.json.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "difflux");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG = {
  context: 0,
};

/**
 * Read and validate the user's difflux configuration.
 * @returns {object} Validated configuration object.
 * @throws {Error} If the config file exists but contains invalid JSON.
 * @throws {Error} If the context value is not a non-negative integer.
 */
export function readConfig() {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    const config = JSON.parse(raw);

    if (config.context !== undefined) {
      if (
        !Number.isInteger(config.context) ||
        config.context < 0
      ) {
        throw new Error(
          `Invalid config: "context" must be a non-negative integer, got ${JSON.stringify(config.context)}.`,
        );
      }
    }

    return { ...DEFAULT_CONFIG, ...config };
  } catch (err) {
    // ENOENT means the file doesn't exist — return defaults
    if (err.code === "ENOENT") {
      return { ...DEFAULT_CONFIG };
    }

    // Any other error (parse failure, validation) re-throws
    throw err;
  }
}
