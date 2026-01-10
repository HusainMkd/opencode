import { useSync } from "@tui/context/sync"
import { createMemo, For, Show, Switch, Match } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../../context/theme"
import { Locale } from "@/util/locale"
import path from "path"
import type { AssistantMessage, Session } from "@opencode-ai/sdk/v2"
import { Global } from "@/global"
import { Installation } from "@/installation"
import { useKeybind } from "../../context/keybind"
import { useDirectory } from "../../context/directory"
import { useKV } from "../../context/kv"
import { TodoItem } from "../../component/todo-item"

// Helper to format tokens compactly
function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"
  if (n >= 1000) return (n / 1000).toFixed(1) + "k"
  return n.toString()
}

// Helper to format cost
function formatCost(cost: number): string {
  if (cost >= 1) return "$" + cost.toFixed(2)
  if (cost >= 0.01) return "$" + cost.toFixed(2)
  return "$" + cost.toFixed(3)
}

// Helper to format duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return seconds + "s"
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes < 60) return minutes + "m " + secs + "s"
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hours + "h " + mins + "m"
}

// Helper to get provider shortcode
function getProviderShortcode(providerID: string): string {
  const shortcuts: Record<string, string> = {
    anthropic: "anth",
    openai: "oai",
    google: "goog",
    groq: "groq",
    openrouter: "or",
    together: "tog",
    fireworks: "fw",
    bedrock: "bed",
    azure: "az",
    copilot: "cop",
  }
  return shortcuts[providerID] || providerID.substring(0, 4)
}

// Type for subagent stats
interface SubagentStats {
  session: Session
  tokens: number
  percentage: number | null
  cost: number
  requests: number
  provider: string
  model: string
  tokPerSec: number | null
  title: string
  isActive: boolean
  duration: number
}

export function Sidebar(props: { sessionID: string }) {
  const sync = useSync()
  const { theme } = useTheme()
  const session = createMemo(() => sync.session.get(props.sessionID)!)
  const diff = createMemo(() => sync.data.session_diff[props.sessionID] ?? [])
  const todo = createMemo(() => sync.data.todo[props.sessionID] ?? [])
  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])

  const [expanded, setExpanded] = createStore({
    mcp: true,
    diff: true,
    todo: true,
    lsp: true,
    subagents: true,
  })

  // Sort MCP servers alphabetically for consistent display order
  const mcpEntries = createMemo(() => Object.entries(sync.data.mcp).sort(([a], [b]) => a.localeCompare(b)))

  // Count connected and error MCP servers for collapsed header display
  const connectedMcpCount = createMemo(() => mcpEntries().filter(([_, item]) => item.status === "connected").length)
  const errorMcpCount = createMemo(
    () =>
      mcpEntries().filter(
        ([_, item]) =>
          item.status === "failed" || item.status === "needs_auth" || item.status === "needs_client_registration",
      ).length,
  )

  // Main agent cost
  const cost = createMemo(() => {
    const total = messages().reduce((sum, x) => sum + (x.role === "assistant" ? x.cost : 0), 0)
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(total)
  })

  // Main agent context
  const context = createMemo(() => {
    const last = messages().findLast(
      (x) => x.role === "assistant" && x.tokens && x.tokens.output > 0,
    ) as AssistantMessage
    if (!last || !last.tokens) return { tokens: "0", percentage: 0 }
    const total =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = sync.data.provider.find((x) => x.id === last.providerID)?.models[last.modelID]
    return {
      tokens: total.toLocaleString(),
      percentage: model?.limit.context ? Math.round((total / model.limit.context) * 100) : 0,
    }
  })

  // Main agent full stats
  const mainAgentStats = createMemo(() => {
    const msgs = messages().filter((x) => x.role === "assistant") as AssistantMessage[]
    let inTok = 0,
      outTok = 0,
      cacheTok = 0,
      reasoningTok = 0,
      totalCost = 0
    let firstTime: number | null = null
    let lastTime: number | null = null

    for (const m of msgs) {
      if (m.tokens) {
        inTok += m.tokens.input || 0
        outTok += m.tokens.output || 0
        cacheTok += (m.tokens.cache?.read || 0) + (m.tokens.cache?.write || 0)
        reasoningTok += m.tokens.reasoning || 0
      }
      totalCost += m.cost || 0
      if (m.time?.created) {
        if (firstTime === null) firstTime = m.time.created
        lastTime = m.time.completed || m.time.created
      }
    }

    // Calculate lines changed from diff
    const diffs = diff()
    let additions = 0,
      deletions = 0
    for (const d of diffs) {
      additions += d.additions || 0
      deletions += d.deletions || 0
    }

    // Duration
    const duration = firstTime && lastTime ? lastTime - firstTime : 0

    return {
      input: inTok,
      output: outTok,
      cache: cacheTok,
      reasoning: reasoningTok,
      cost: totalCost,
      requests: msgs.length,
      additions,
      deletions,
      duration,
    }
  })

  // Subagent sessions with full stats
  const subagents = createMemo((): SubagentStats[] => {
    const subs = sync.data.session.filter((s) => s.parentID === props.sessionID)
    return subs
      .map((sub) => {
        const subMsgs = (sync.data.message[sub.id] || []).filter((x) => x.role === "assistant") as AssistantMessage[]
        const status = sync.data.session_status[sub.id]
        const isActive = status?.type === "busy"

        let tokens = 0,
          cost = 0
        let firstTime: number | null = null
        let lastTime: number | null = null
        let lastProvider = ""
        let lastModel = ""

        for (const m of subMsgs) {
          if (m.tokens) {
            tokens +=
              m.tokens.input +
              m.tokens.output +
              (m.tokens.reasoning || 0) +
              (m.tokens.cache?.read || 0) +
              (m.tokens.cache?.write || 0)
          }
          cost += m.cost || 0
          if (m.time?.created) {
            if (firstTime === null) firstTime = m.time.created
            lastTime = m.time.completed || m.time.created
          }
          if (m.providerID) lastProvider = m.providerID
          if (m.modelID) lastModel = m.modelID
        }

        // Get context percentage from last message
        let percentage: number | null = null
        const lastMsg = subMsgs.at(-1)
        if (lastMsg && lastMsg.tokens) {
          const total =
            lastMsg.tokens.input +
            lastMsg.tokens.output +
            (lastMsg.tokens.reasoning || 0) +
            (lastMsg.tokens.cache?.read || 0) +
            (lastMsg.tokens.cache?.write || 0)
          const model = sync.data.provider.find((x) => x.id === lastMsg.providerID)?.models[lastMsg.modelID]
          if (model?.limit.context) {
            percentage = Math.round((total / model.limit.context) * 100)
          }
        }

        // Tokens per second
        const duration = firstTime && lastTime ? (lastTime - firstTime) / 1000 : 0
        const tokPerSec = duration > 0 ? Math.round(tokens / duration) : null

        return {
          session: sub,
          tokens,
          percentage,
          cost,
          requests: subMsgs.length,
          provider: getProviderShortcode(lastProvider),
          model: lastModel.split("-").slice(-2).join("-"), // Shorten model name
          tokPerSec,
          title: sub.title || "Subagent",
          isActive,
          duration: duration * 1000,
        }
      })
      .sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0)) // Active first
  })

  const activeSubagentCount = createMemo(() => subagents().filter((s) => s.isActive).length)
  const idleSubagentCount = createMemo(() => subagents().filter((s) => !s.isActive).length)

  const directory = useDirectory()
  const kv = useKV()

  const hasProviders = createMemo(() =>
    sync.data.provider.some((x) => x.id !== "opencode" || Object.values(x.models).some((y) => y.cost?.input !== 0)),
  )
  const gettingStartedDismissed = createMemo(() => kv.get("dismissed_getting_started", false))

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
      >
        <scrollbox flexGrow={1}>
          <box flexShrink={0} gap={1} paddingRight={1}>
            <box>
              <text fg={theme.text}>
                <b>{session().title}</b>
              </text>
              <Show when={session().share?.url}>
                <text fg={theme.textMuted}>{session().share!.url}</text>
              </Show>
            </box>
            {/* Two-column layout: Context | Stats */}
            <box flexDirection="row" gap={2}>
              {/* Left column: Context */}
              <box flexGrow={1}>
                <text fg={theme.text}>
                  <b>Context</b>
                </text>
                <text fg={theme.textMuted}>{context().tokens} tok</text>
                <text fg={theme.textMuted}>{context().percentage}% used</text>
                <text fg={theme.textMuted}>{cost()} spent</text>
              </box>
              {/* Right column: Stats */}
              <box flexGrow={1}>
                <text fg={theme.text}>
                  <b>Stats</b>
                </text>
                <text fg={theme.textMuted}>In: {formatTokens(mainAgentStats().input)}</text>
                <text fg={theme.textMuted}>Out: {formatTokens(mainAgentStats().output)}</text>
                <Show when={mainAgentStats().cache > 0}>
                  <text fg={theme.textMuted}>Cache: {formatTokens(mainAgentStats().cache)}</text>
                </Show>
                <text fg={theme.textMuted}>Req: {mainAgentStats().requests}</text>
                <Show when={mainAgentStats().duration > 0}>
                  <text fg={theme.textMuted}>{formatDuration(mainAgentStats().duration)}</text>
                </Show>
                <Show when={mainAgentStats().additions > 0 || mainAgentStats().deletions > 0}>
                  <text>
                    <span style={{ fg: theme.diffAdded }}>+{mainAgentStats().additions}</span>
                    <span style={{ fg: theme.diffRemoved }}>/-{mainAgentStats().deletions}</span>
                  </text>
                </Show>
              </box>
            </box>
            {/* Subagents section */}
            <Show when={subagents().length > 0}>
              <box>
                <box flexDirection="row" gap={1} onMouseDown={() => setExpanded("subagents", !expanded.subagents)}>
                  <text fg={theme.text}>{expanded.subagents ? "▼" : "▶"}</text>
                  <text fg={theme.text}>
                    <b>Subagents</b>
                    <span style={{ fg: theme.textMuted }}>
                      {" "}
                      ({activeSubagentCount()} active, {idleSubagentCount()} idle)
                    </span>
                  </text>
                </box>
                <Show when={expanded.subagents}>
                  <For each={subagents()}>
                    {(sub) => (
                      <box paddingLeft={1}>
                        {/* Row 1: Status + Title */}
                        <box flexDirection="row" gap={1}>
                          <text flexShrink={0} style={{ fg: sub.isActive ? theme.success : theme.textMuted }}>
                            {sub.isActive ? "●" : "○"}
                          </text>
                          <text fg={theme.text} wrapMode="word">
                            {Locale.truncateMiddle(sub.title, 28)}
                          </text>
                        </box>
                        {/* Row 2: Stats line */}
                        <text fg={theme.textMuted}>
                          {formatTokens(sub.tokens)} {sub.percentage !== null ? sub.percentage + "%" : ""} $
                          {sub.cost.toFixed(2)} #{sub.requests} {sub.provider}/{sub.model}{" "}
                          {sub.tokPerSec ? sub.tokPerSec + "t/s" : ""}
                        </text>
                      </box>
                    )}
                  </For>
                </Show>
              </box>
            </Show>
            <Show when={mcpEntries().length > 0}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => mcpEntries().length > 2 && setExpanded("mcp", !expanded.mcp)}
                >
                  <Show when={mcpEntries().length > 2}>
                    <text fg={theme.text}>{expanded.mcp ? "▼" : "▶"}</text>
                  </Show>
                  <text fg={theme.text}>
                    <b>MCP</b>
                    <Show when={!expanded.mcp}>
                      <span style={{ fg: theme.textMuted }}>
                        {" "}
                        ({connectedMcpCount()} active
                        {errorMcpCount() > 0 ? `, ${errorMcpCount()} error${errorMcpCount() > 1 ? "s" : ""}` : ""})
                      </span>
                    </Show>
                  </text>
                </box>
                <Show when={mcpEntries().length <= 2 || expanded.mcp}>
                  <For each={mcpEntries()}>
                    {([key, item]) => (
                      <box flexDirection="row" gap={1}>
                        <text
                          flexShrink={0}
                          style={{
                            fg: (
                              {
                                connected: theme.success,
                                failed: theme.error,
                                disabled: theme.textMuted,
                                needs_auth: theme.warning,
                                needs_client_registration: theme.error,
                              } as Record<string, typeof theme.success>
                            )[item.status],
                          }}
                        >
                          •
                        </text>
                        <text fg={theme.text} wrapMode="word">
                          {key}{" "}
                          <span style={{ fg: theme.textMuted }}>
                            <Switch fallback={item.status}>
                              <Match when={item.status === "connected"}>Connected</Match>
                              <Match when={item.status === "failed" && item}>{(val) => <i>{val().error}</i>}</Match>
                              <Match when={item.status === "disabled"}>Disabled</Match>
                              <Match when={(item.status as string) === "needs_auth"}>Needs auth</Match>
                              <Match when={(item.status as string) === "needs_client_registration"}>
                                Needs client ID
                              </Match>
                            </Switch>
                          </span>
                        </text>
                      </box>
                    )}
                  </For>
                </Show>
              </box>
            </Show>
            <box>
              <box
                flexDirection="row"
                gap={1}
                onMouseDown={() => sync.data.lsp.length > 2 && setExpanded("lsp", !expanded.lsp)}
              >
                <Show when={sync.data.lsp.length > 2}>
                  <text fg={theme.text}>{expanded.lsp ? "▼" : "▶"}</text>
                </Show>
                <text fg={theme.text}>
                  <b>LSP</b>
                </text>
              </box>
              <Show when={sync.data.lsp.length <= 2 || expanded.lsp}>
                <Show when={sync.data.lsp.length === 0}>
                  <text fg={theme.textMuted}>
                    {sync.data.config.lsp === false
                      ? "LSPs have been disabled in settings"
                      : "LSPs will activate as files are read"}
                  </text>
                </Show>
                <For each={sync.data.lsp}>
                  {(item) => (
                    <box flexDirection="row" gap={1}>
                      <text
                        flexShrink={0}
                        style={{
                          fg: {
                            connected: theme.success,
                            error: theme.error,
                          }[item.status],
                        }}
                      >
                        •
                      </text>
                      <text fg={theme.textMuted}>
                        {item.id} {item.root}
                      </text>
                    </box>
                  )}
                </For>
              </Show>
            </box>
            <Show when={todo().length > 0 && todo().some((t) => t.status !== "completed")}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => todo().length > 2 && setExpanded("todo", !expanded.todo)}
                >
                  <Show when={todo().length > 2}>
                    <text fg={theme.text}>{expanded.todo ? "▼" : "▶"}</text>
                  </Show>
                  <text fg={theme.text}>
                    <b>Todo</b>
                  </text>
                </box>
                <Show when={todo().length <= 2 || expanded.todo}>
                  <For each={todo()}>{(todo) => <TodoItem status={todo.status} content={todo.content} />}</For>
                </Show>
              </box>
            </Show>
            <Show when={diff().length > 0}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => diff().length > 2 && setExpanded("diff", !expanded.diff)}
                >
                  <Show when={diff().length > 2}>
                    <text fg={theme.text}>{expanded.diff ? "▼" : "▶"}</text>
                  </Show>
                  <text fg={theme.text}>
                    <b>Modified Files</b>
                  </text>
                </box>
                <Show when={diff().length <= 2 || expanded.diff}>
                  <For each={diff() || []}>
                    {(item) => {
                      const file = createMemo(() => {
                        const splits = item.file.split(path.sep).filter(Boolean)
                        const last = splits.at(-1)!
                        const rest = splits.slice(0, -1).join(path.sep)
                        if (!rest) return last
                        return Locale.truncateMiddle(rest, 30 - last.length) + "/" + last
                      })
                      return (
                        <box flexDirection="row" gap={1} justifyContent="space-between">
                          <text fg={theme.textMuted} wrapMode="char">
                            {file()}
                          </text>
                          <box flexDirection="row" gap={1} flexShrink={0}>
                            <Show when={item.additions}>
                              <text fg={theme.diffAdded}>+{item.additions}</text>
                            </Show>
                            <Show when={item.deletions}>
                              <text fg={theme.diffRemoved}>-{item.deletions}</text>
                            </Show>
                          </box>
                        </box>
                      )
                    }}
                  </For>
                </Show>
              </box>
            </Show>
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <Show when={!hasProviders() && !gettingStartedDismissed()}>
            <box
              backgroundColor={theme.backgroundElement}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              paddingRight={2}
              flexDirection="row"
              gap={1}
            >
              <text flexShrink={0} fg={theme.text}>
                ⬖
              </text>
              <box flexGrow={1} gap={1}>
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={theme.text}>
                    <b>Getting started</b>
                  </text>
                  <text fg={theme.textMuted} onMouseDown={() => kv.set("dismissed_getting_started", true)}>
                    ✕
                  </text>
                </box>
                <text fg={theme.textMuted}>OpenCode includes free models so you can start immediately.</text>
                <text fg={theme.textMuted}>
                  Connect from 75+ providers to use other models, including Claude, GPT, Gemini etc
                </text>
                <box flexDirection="row" gap={1} justifyContent="space-between">
                  <text fg={theme.text}>Connect provider</text>
                  <text fg={theme.textMuted}>/connect</text>
                </box>
              </box>
            </box>
          </Show>
          <text>
            <span style={{ fg: theme.textMuted }}>{directory().split("/").slice(0, -1).join("/")}/</span>
            <span style={{ fg: theme.text }}>{directory().split("/").at(-1)}</span>
          </text>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.success }}>•</span> <b>Open</b>
            <span style={{ fg: theme.text }}>
              <b>Code</b>
            </span>{" "}
            <span>{Installation.VERSION}</span>
          </text>
        </box>
      </box>
    </Show>
  )
}
