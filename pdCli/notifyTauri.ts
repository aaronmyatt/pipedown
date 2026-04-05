// ── Tauri Desktop Notification IPC ──
//
// Sends event messages to the pd-desktop Tauri app via a Unix domain socket.
// The protocol is newline-delimited JSON over `/tmp/pipedown.sock`.
// If the Tauri app isn't running, all writes silently fail — pd must never
// crash or block because of IPC issues.
//
// Ref: https://docs.deno.com/api/deno/~/Deno.connect (Unix transport)
// TODO: update to github repo path when available
// Ref: /Users/aaronmyatt/pipes/pd-desktop/src-tauri/src/ipc.rs (IpcEvent struct)

// ── Socket Path ──
// `/tmp/` is conventional for IPC sockets on macOS/Linux — writable by all
// users and cleaned up on reboot (no stale sockets after crashes).
const TAURI_SOCKET_PATH = "/tmp/pipedown.sock";

/**
 * Shape of an event sent to the Tauri desktop app.
 *
 * Maps directly to the `IpcEvent` Rust struct in pd-desktop's `ipc.rs`.
 * All fields except `type` are optional — the Rust side uses `#[serde(default)]`
 * for every field other than `event_type`.
 *
 * @property type - Event identifier. Known types:
 *   - `run_start`     — pipe is about to begin executing
 *   - `run_complete`  — pipe finished executing (success or failure)
 *   - `llm_complete`  — LLM action finished
 *   - `test_complete` — tests finished
 *   - `pack_complete` — pack operation finished
 *   - `error`         — an operation failed
 *   - `ping`          — keepalive (no notification fired)
 * @property title   - Human-readable notification title (fallback auto-generated in Rust)
 * @property message - Notification body text
 * @property project - Project name for context
 * @property pipe    - Pipe name for context
 * @property success - Whether the operation succeeded
 */
export interface TauriEvent {
  type: string;
  title?: string;
  message?: string;
  project?: string;
  pipe?: string;
  success?: boolean;
}

/**
 * Attempt to connect to the Tauri desktop app's Unix socket.
 * Returns the connection if successful, or null if the socket doesn't exist
 * (meaning the Tauri app isn't running).
 *
 * @returns A Deno.Conn object for writing events, or null
 */
async function connectToTauriSocket(): Promise<Deno.Conn | null> {
  try {
    // Deno.connect with transport: "unix" opens a Unix domain socket.
    // This will throw if the socket file doesn't exist (Tauri not running).
    // Ref: https://docs.deno.com/api/deno/~/Deno.connect
    const conn = await Deno.connect({
      transport: "unix",
      path: TAURI_SOCKET_PATH,
    });
    return conn;
  } catch {
    // Socket doesn't exist or connection refused — Tauri app isn't running.
    // This is the expected case for standalone `pd` usage.
    return null;
  }
}

/**
 * Send an event notification to the Tauri desktop app via Unix socket.
 *
 * This is a fire-and-forget operation: if the socket isn't available or the
 * write fails, the error is silently ignored. The pd server must never crash
 * or block because of Tauri IPC issues.
 *
 * @param event - A TauriEvent object describing what happened.
 *
 * Ref: /Users/aaronmyatt/pipes/pd-desktop/src-tauri/src/ipc.rs (IpcEvent struct)
 */
export async function notifyTauri(event: TauriEvent): Promise<void> {
  try {
    const conn = await connectToTauriSocket();
    if (!conn) return; // Tauri not running — silently skip

    // Encode the event as newline-delimited JSON (the IPC protocol).
    // Each message is a single JSON object followed by `\n` — no length
    // prefix, no binary framing. Matches the pd-desktop socket reader
    // which uses tokio's `AsyncBufReadExt::read_line()`.
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(event) + "\n");
    await conn.write(data);
    conn.close();
  } catch {
    // Silently ignore any write errors — the pd server must not be
    // affected by Tauri IPC failures.
  }
}
