const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function conversationMarkup() {
  return `<div id="conversations" class="conversation-layout"><aside class="chat-sidebar"><div class="section-head"><h3>Saved chats</h3><button id="new-chat" title="New conversation">＋</button></div><div id="chat-list">Loading conversations…</div><small>Private to your account and this server.</small></aside><section class="chat-main"><div id="chat-messages" aria-live="polite"></div><form id="chat-compose"><label for="chat-input">Your message</label><textarea id="chat-input" maxlength="1500" rows="4" placeholder="Describe what you want to do…" required></textarea><div class="actions"><label id="instant-option"><input id="chat-ai" type="checkbox" checked> Use local AI</label><button class="primary" type="submit">Send ↗</button></div><p id="chat-status" role="status"></p></form></section></div>`;
}
export async function mountConversations({
  api,
  kind,
  onDraft,
  notify,
  scope,
}) {
  const root = document.getElementById("conversations");
  if (!root) return;
  const $ = (s) => root.querySelector(s),
    key = "seep-chat:" + scope + ":" + kind;
  let selected = null,
    busy = false;
  $("#instant-option").hidden = kind !== "plan";
  function show(chat) {
    selected = chat;
    sessionStorage.setItem(key, chat.id);
    $("#chat-messages").innerHTML = chat.messages.length
      ? chat.messages
          .map(
            (m) =>
              `<article class="chat-message ${m.role}"><strong>${m.role === "user" ? "You" : "seep"}</strong><p>${esc(m.content)}</p>${m.draft ? "<small>Layout draft · preview expires after 15 minutes</small>" : ""}</article>`,
          )
          .join("")
      : '<div class="chat-greeting"><img src="/seep-logo.png" alt="seep"><h2>What shall we create?</h2><p>' +
        (kind === "plan"
          ? "Describe your server or the channels you want to add. Refine your layout in this conversation."
          : "Ask a question. Your previous messages help seep follow the conversation.") +
        "</p></div>";
    $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
    if (kind === "plan")
      onDraft(chat.messages.filter((m) => m.draft).at(-1)?.draft || null);
  }
  async function refresh() {
    const list = await api("chats");
    if (!root.isConnected) return;
    $("#chat-list").innerHTML =
      list
        .filter((x) => x.kind === kind)
        .map(
          (x) =>
            `<div class="chat-row"><button class="chat-select ${selected?.id === x.id ? "selected" : ""}" data-id="${x.id}">${esc(x.title)}</button><button data-delete="${x.id}" title="Delete saved chat">×</button></div>`,
        )
        .join("") || "<p>No conversations yet.</p>";
    root.querySelectorAll("[data-id]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (busy) return;
          try {
            show(await api("chats?id=" + encodeURIComponent(b.dataset.id)));
            await refresh();
          } catch (e) {
            notify(e.message);
          }
        }),
    );
    root.querySelectorAll("[data-delete]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (busy || !window.confirm("Delete this saved conversation?"))
            return;
          try {
            await api("chats", { action: "delete", id: b.dataset.delete });
            if (selected?.id === b.dataset.delete) {
              selected = null;
              sessionStorage.removeItem(key);
              $("#chat-messages").innerHTML = "";
              onDraft(null);
            }
            await refresh();
          } catch (e) {
            notify(e.message);
          }
        }),
    );
  }
  $("#new-chat").onclick = async () => {
    if (busy) return;
    try {
      show(await api("chats", { action: "create", kind }));
      await refresh();
    } catch (e) {
      notify(e.message);
    }
  };
  $("#chat-compose").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const button = e.target.querySelector("button[type=submit]"),
      input = $("#chat-input"),
      text = input.value;
    button.disabled = true;
    $("#chat-status").textContent = "seep is thinking locally…";
    try {
      if (!selected) selected = await api("chats", { action: "create", kind });
      show(
        await api("chats", {
          action: "send",
          id: selected.id,
          text,
          ai: $("#chat-ai").checked,
        }),
      );
      input.value = "";
      $("#chat-status").textContent = "Saved";
      await refresh();
    } catch (error) {
      $("#chat-status").textContent = error.message;
      if (selected)
        try {
          show(await api("chats?id=" + selected.id));
          await refresh();
        } catch {}
    } finally {
      busy = false;
      button.disabled = false;
    }
  };
  try {
    const id = sessionStorage.getItem(key);
    if (id)
      try {
        show(await api("chats?id=" + id));
      } catch {
        sessionStorage.removeItem(key);
      }
    if (!selected)
      $("#chat-messages").innerHTML =
        '<div class="chat-greeting"><img src="/seep-logo.png" alt="seep"><h2>Start a conversation</h2><p>Your chats will be saved in the sidebar.</p></div>';
    await refresh();
  } catch (e) {
    $("#chat-status").textContent = e.message;
  }
}
