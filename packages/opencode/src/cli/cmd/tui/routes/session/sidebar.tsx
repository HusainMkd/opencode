import { useProject } from "@tui/context/project"
import { useSync } from "@tui/context/sync"
import { createMemo, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../context/tui-config"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { TuiPluginRuntime } from "@/cli/cmd/tui/plugin/runtime"
import type { AssistantMessage } from "@opencode-ai/sdk/v2"

import { getScrollAcceleration } from "../../util/scroll"
import { WorkspaceLabel } from "../../component/workspace-label"

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toString()
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function Sidebar(props: { sessionID: string; overlay?: boolean }) {
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])
  const diff = createMemo(() => sync.data.session_diff[props.sessionID] ?? [])
  const workspace = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  }
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  const cost = createMemo(() => {
    const total = messages().reduce((sum, item) => sum + (item.role === "assistant" ? item.cost || 0 : 0), 0)
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(total)
  })
  const context = createMemo(() => {
    const last = messages().findLast(
      (item): item is AssistantMessage => item.role === "assistant" && !!item.tokens && item.tokens.output > 0,
    )
    if (!last?.tokens) return { tokens: "0", percentage: 0 }
    const total =
      last.tokens.input +
      last.tokens.output +
      (last.tokens.reasoning || 0) +
      (last.tokens.cache?.read || 0) +
      (last.tokens.cache?.write || 0)
    const model = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    return {
      tokens: total.toLocaleString(),
      percentage: model?.limit.context ? Math.round((total / model.limit.context) * 100) : 0,
    }
  })
  const stats = createMemo(() => {
    let input = 0
    let output = 0
    let cache = 0
    let reasoning = 0
    let requests = 0
    let firstTime: number | null = null
    let lastTime: number | null = null

    for (const message of messages()) {
      if (message.role !== "assistant") continue
      requests++
      if (message.tokens) {
        input += message.tokens.input || 0
        output += message.tokens.output || 0
        cache += (message.tokens.cache?.read || 0) + (message.tokens.cache?.write || 0)
        reasoning += message.tokens.reasoning || 0
      }
      if (message.time?.created) {
        firstTime ??= message.time.created
        lastTime = message.time.completed || message.time.created
      }
    }

    let additions = 0
    let deletions = 0
    for (const item of diff()) {
      additions += item.additions || 0
      deletions += item.deletions || 0
    }

    return {
      input,
      output,
      cache,
      reasoning,
      requests,
      additions,
      deletions,
      duration: firstTime && lastTime ? lastTime - firstTime : 0,
    }
  })

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        position={props.overlay ? "absolute" : "relative"}
      >
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            <TuiPluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
              share_url={session()!.share?.url}
            >
              <box paddingRight={1}>
                <text fg={theme.text}>
                  <b>{session()!.title}</b>
                </text>
                <Show when={InstallationChannel !== "latest"}>
                  <text fg={theme.textMuted}>{props.sessionID}</text>
                </Show>
                <Show when={session()!.workspaceID}>
                  <text fg={theme.textMuted}>
                    <Show
                      when={workspace()}
                      fallback={<WorkspaceLabel type="unknown" name={session()!.workspaceID!} status="error" icon />}
                    >
                      {(item) => (
                        <WorkspaceLabel
                          type={item().type}
                          name={item().name}
                          status={project.workspace.status(item().id) ?? "error"}
                          icon
                        />
                      )}
                    </Show>
                  </text>
                </Show>
                <Show when={session()!.share?.url}>
                  <text fg={theme.textMuted}>{session()!.share!.url}</text>
                </Show>
              </box>
            </TuiPluginRuntime.Slot>
            <TuiPluginRuntime.Slot name="sidebar_content" session_id={props.sessionID}>
              <box gap={1}>
                <box flexDirection="row" gap={2}>
                  <box flexGrow={1}>
                    <text fg={theme.text}>
                      <b>Context</b>
                    </text>
                    <text fg={theme.textMuted}>{context().tokens} tok</text>
                    <text fg={theme.textMuted}>{context().percentage}% used</text>
                    <text fg={theme.textMuted}>{cost()} spent</text>
                  </box>
                  <box flexGrow={1}>
                    <text fg={theme.text}>
                      <b>Stats</b>
                    </text>
                    <text fg={theme.textMuted}>In: {formatTokens(stats().input)}</text>
                    <text fg={theme.textMuted}>Out: {formatTokens(stats().output)}</text>
                    <Show when={stats().cache > 0}>
                      <text fg={theme.textMuted}>Cache: {formatTokens(stats().cache)}</text>
                    </Show>
                    <Show when={stats().reasoning > 0}>
                      <text fg={theme.textMuted}>Reason: {formatTokens(stats().reasoning)}</text>
                    </Show>
                    <text fg={theme.textMuted}>Req: {stats().requests}</text>
                    <Show when={stats().duration > 0}>
                      <text fg={theme.textMuted}>{formatDuration(stats().duration)}</text>
                    </Show>
                  </box>
                </box>
                <Show when={stats().additions > 0 || stats().deletions > 0}>
                  <text fg={theme.textMuted}>
                    Diff{" "}
                    <span style={{ fg: theme.diffAdded }}>+{stats().additions}</span>{" "}
                    <span style={{ fg: theme.diffRemoved }}>-{stats().deletions}</span>
                  </text>
                </Show>
              </box>
            </TuiPluginRuntime.Slot>
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <TuiPluginRuntime.Slot name="sidebar_footer" mode="single_winner" session_id={props.sessionID}>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.success }}>•</span> <b>Open</b>
              <span style={{ fg: theme.text }}>
                <b>Code</b>
              </span>{" "}
              <span>{InstallationVersion}</span>
            </text>
          </TuiPluginRuntime.Slot>
        </box>
      </box>
    </Show>
  )
}
