import { log } from "./logger.ts"

/**
 * Plugin settings that can be set via opencode.json as an alternative
 * to environment variables.
 *
 * Priority: environment variable > opencode.json config > hardcoded default
 *
 * In opencode.json (project-level or ~/.config/opencode/opencode.json):
 *
 * ```json
 * {
 *   "agent": {
 *     "build": {
 *       "enable1mContext": true
 *     }
 *   }
 * }
 * ```
 */
export interface PluginSettings {
  enable1mContext?: boolean
  claudeCodeCredentialPath?: string
}

let settings: PluginSettings = {}

/**
 * Extract plugin settings from the opencode Config object.
 *
 * Scans all agent configs for our plugin-specific keys. AgentConfig has
 * a catch-all `[key: string]: unknown` index signature, so arbitrary
 * keys placed in agent configs are preserved through OpenCode's
 * config parser and passed to the plugin via the `config` hook.
 *
 * NOTE: OpenCode's Zod schema may relocate unknown top-level agent keys
 * into `agent.options`. We check both locations defensively so this
 * survives future config parser changes.
 *
 * The first boolean value found (in any agent) wins — even if `false`.
 */
export function applyOpencodeConfig(config: unknown): void {
  if (!config || typeof config !== "object") return

  const cfg = config as Record<string, unknown>
  const agents = cfg.agent as Record<string, unknown> | undefined
  const provider = cfg.provider as Record<string, unknown> | undefined
  let loadedKeys = 0

  const claudeAuthProvider = provider?.["claude-auth"]
  const claudeAuthOptions =
    claudeAuthProvider && typeof claudeAuthProvider === "object"
      ? (claudeAuthProvider as Record<string, unknown>).options
      : undefined
  const credentialPath =
    claudeAuthOptions && typeof claudeAuthOptions === "object"
      ? (claudeAuthOptions as Record<string, unknown>).claudeCodeCredentialPath
      : undefined

  if (typeof credentialPath === "string") {
    settings.claudeCodeCredentialPath = credentialPath
    loadedKeys += 1
    log("config_loaded", { claudeCodeCredentialPath: credentialPath })
  } else if (credentialPath !== undefined) {
    log("config_invalid_type", {
      key: "claudeCodeCredentialPath",
      expectedType: "string",
      actualType: typeof credentialPath,
    })
  }

  if (agents && typeof agents === "object") {
    for (const agentConfig of Object.values(agents)) {
      if (!agentConfig || typeof agentConfig !== "object") continue
      const agent = agentConfig as Record<string, unknown>

      // Check top-level first, then fall back to options (where OpenCode's
      // Zod transform may relocate unknown keys)
      const val =
        agent.enable1mContext ??
        (agent.options as Record<string, unknown> | undefined)?.enable1mContext

      if (typeof val === "boolean") {
        settings.enable1mContext = val
        loadedKeys += 1
        log("config_loaded", { enable1mContext: val })
        break
      }

      if (val !== undefined) {
        log("config_invalid_type", {
          key: "enable1mContext",
          expectedType: "boolean",
          actualType: typeof val,
        })
      }
    }
  }

  if (loadedKeys === 0) {
    log("config_no_plugin_keys", {
      agentCount:
        agents && typeof agents === "object" ? Object.keys(agents).length : 0,
    })
  }
}

/**
 * Whether 1M context should be enabled.
 *
 * Priority: ANTHROPIC_ENABLE_1M_CONTEXT env var > opencode.json > false
 */
export function isEnable1mContext(): boolean {
  const envVal = process.env.ANTHROPIC_ENABLE_1M_CONTEXT
  if (envVal !== undefined) return envVal === "true"
  return settings.enable1mContext === true
}

export function resetPluginSettings(): void {
  settings = {}
}

export function getPluginSettings(): Readonly<PluginSettings> {
  return { ...settings }
}

export function getClaudeCodeCredentialPath(): string | undefined {
  return settings.claudeCodeCredentialPath
}
