const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const STATUSES = ["Y", "N", "NA"];
const VIEWS = ["dashboard", "profile", "habits", "journal", "thoughts", "files", "data"];
const MAX_CLIENT_FILE_BYTES = 25 * 1024 * 1024;

const state = {
  profile: null,
  profileQuestions: [],
  habits: [],
  journal: [],
  thoughts: [],
  files: [],
};

let profilePath = "";
let habitsCsvContent = "";
let habitsCsvPath = "";
// Tags for a journal entry that hasn't been created yet -- pure client-side
// state, built up as chips before "Add entry" turns it into one API call.
let pendingJournalTags = [];

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = data?.error ?? `HTTP ${res.status}`;
    throw new Error(`${method} /api/${path} → ${reason}`);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function flashButton(button, message) {
  if (!button) return;
  const original = button.textContent;
  button.textContent = message;
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    flashButton(button, "Copied!");
  } catch (err) {
    alert(`Couldn't copy to clipboard: ${err.message}`);
  }
}

// ---------- Navigation ----------

function showView(name) {
  const view = VIEWS.includes(name) ? name : "dashboard";
  $$(".view").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  if (location.hash.slice(1) !== view) location.hash = view;
}

$$(".nav-item").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
window.addEventListener("hashchange", () => showView(location.hash.slice(1)));

// ---------- Row templates (shared between a full section and the dashboard preview) ----------

const FREQUENCY_UNITS = { daily: "days", weekly: "weeks", monthly: "months" };
const FREQUENCY_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

function habitRowHtml(habit) {
  const rate = Math.round(habit.completionRate * 100);
  const unit = FREQUENCY_UNITS[habit.frequency] ?? "days";
  const freqLabel = FREQUENCY_LABELS[habit.frequency] ?? "Daily";
  return `
    <div class="row" data-habit-id="${habit.id}">
      <div class="habit-name">
        ${escapeHtml(habit.name)}
        <span class="sub">${freqLabel} · streak ${habit.currentStreak} ${unit} · best ${habit.longestStreak} ${unit} · ${rate}% all-time</span>
      </div>
      <div class="status-group" data-habit-id="${habit.id}">
        ${STATUSES.map(
          (s) =>
            `<button type="button" class="status-btn" data-status="${s}" data-active="${s === habit.currentPeriodStatus}">${s}</button>`,
        ).join("")}
      </div>
      <button type="button" class="ghost small" data-action="archive-habit" data-habit-id="${habit.id}">Archive</button>
      <button type="button" class="ghost small" data-action="delete-habit" data-habit-id="${habit.id}">Delete</button>
    </div>`;
}

/**
 * The dashboard's habit row: same one-tap status buttons as the Habits section,
 * minus Archive/Delete. Home is for logging in half a second, not managing.
 * No streak here on purpose -- streaks only count *completed* periods, so
 * today's tap wouldn't move the number and would read as a no-op. Stats live
 * on the Habits page.
 */
function dashboardHabitRowHtml(habit) {
  const freqLabel = FREQUENCY_LABELS[habit.frequency] ?? "Daily";
  return `
    <div class="row" data-habit-id="${habit.id}">
      <div class="habit-name">
        ${escapeHtml(habit.name)}
        <span class="sub">${freqLabel}</span>
      </div>
      <div class="status-group" data-habit-id="${habit.id}">
        ${STATUSES.map(
          (s) =>
            `<button type="button" class="status-btn" data-status="${s}" data-active="${s === habit.currentPeriodStatus}">${s}</button>`,
        ).join("")}
      </div>
    </div>`;
}

function archivedHabitRowHtml(habit) {
  const freqLabel = FREQUENCY_LABELS[habit.frequency] ?? "Daily";
  return `
    <div class="row" data-habit-id="${habit.id}">
      <div class="habit-name">
        ${escapeHtml(habit.name)}
        <span class="sub">${freqLabel} · archived</span>
      </div>
      <button type="button" class="ghost small" data-action="unarchive-habit" data-habit-id="${habit.id}">Unarchive</button>
      <button type="button" class="ghost small" data-action="delete-habit" data-habit-id="${habit.id}">Delete</button>
    </div>`;
}

function fileChipHtml(file) {
  return `
    <span class="chip">
      <a href="/api/files/${file.id}/download">${escapeHtml(file.title)}</a>
      <span class="chip-size">${formatBytes(file.size)}</span>
      <button type="button" class="chip-remove" data-action="delete-file" data-file-id="${file.id}" aria-label="Remove ${escapeHtml(file.title)}">×</button>
    </span>`;
}

function journalEntryHtml(entry) {
  const attached = state.files.filter((f) => f.journalEntryId === entry.id);
  return `
    <div class="entry" data-id="${entry.id}">
      <div class="entry-head">
        <h3>${escapeHtml(entry.title)}</h3>
        <time>${formatDate(entry.createdAt)}</time>
      </div>
      <p>${escapeHtml(entry.content)}</p>
      ${entry.tags.length ? `<div class="tags">${entry.tags.map(escapeHtml).join(" · ")}</div>` : ""}
      ${attached.length ? `<div class="file-chips">${attached.map(fileChipHtml).join("")}</div>` : ""}
      ${
        entry.summary
          ? `<p class="eyebrow form-section-label">Summary (${formatDate(entry.summaryGeneratedAt)}, ${escapeHtml(entry.summaryBackend ?? "")})</p><p class="hint">${escapeHtml(entry.summary)}</p>`
          : ""
      }
      <details class="attach">
        <summary>Attach file</summary>
        <form class="stack attach-file-form" data-journal-entry-id="${entry.id}">
          <input type="text" class="attach-title" placeholder="Title" required />
          <input type="text" class="attach-description" placeholder="Description (optional)" />
          <input type="file" class="attach-input" required />
          <button type="submit" class="small">Upload</button>
        </form>
      </details>
      <details class="attach">
        <summary>${entry.summary ? "Edit summary" : "Write summary"}</summary>
        <form class="stack edit-summary-form" data-journal-entry-id="${entry.id}">
          <textarea placeholder="Write a short summary…">${escapeHtml(entry.summary ?? "")}</textarea>
          <button type="submit" class="small">Save summary</button>
        </form>
      </details>
      <div class="actions">
        <button type="button" class="ghost small" data-action="generate-journal-summary" data-id="${entry.id}">${entry.summary ? "Regenerate summary" : "Generate summary"}</button>
        <button type="button" class="ghost small" data-action="delete-journal">Delete entry</button>
      </div>
    </div>`;
}

function thoughtEntryHtml(thought) {
  return `
    <div class="entry" data-id="${thought.id}">
      <div class="entry-head">
        <h3>${escapeHtml(thought.title || "Thought")}</h3>
        <time>${formatDate(thought.createdAt)}</time>
      </div>
      <p>${escapeHtml(thought.content)}</p>
      <div class="actions">
        <button type="button" class="ghost small" data-action="delete-thought">Delete</button>
      </div>
    </div>`;
}

function fileRowHtml(file) {
  const linkedEntry = file.journalEntryId ? state.journal.find((e) => e.id === file.journalEntryId) : undefined;
  return `
    <div class="entry" data-id="${file.id}">
      <div class="entry-head">
        <h3>${escapeHtml(file.title)}</h3>
        <time>${formatDate(file.createdAt)}</time>
      </div>
      ${file.description ? `<p>${escapeHtml(file.description)}</p>` : ""}
      <div class="tags">${escapeHtml(file.filename)} · ${formatBytes(file.size)}${linkedEntry ? ` · attached to “${escapeHtml(linkedEntry.title)}”` : ""}</div>
      <div class="actions">
        <a class="ghost small button-like" href="/api/files/${file.id}/download">Download</a>
        <button type="button" class="ghost small" data-action="delete-file" data-file-id="${file.id}">Delete</button>
      </div>
    </div>`;
}

function renderList(el, items, toHtml, emptyText) {
  el.innerHTML = items.length
    ? items.map(toHtml).join("")
    : emptyText
      ? `<div class="empty">${emptyText}</div>`
      : "";
}

// ---------- Render each section from shared state ----------

function removableChipHtml(value, removeAction) {
  return `
    <span class="chip">
      <span>${escapeHtml(value)}</span>
      <button type="button" class="chip-remove" data-action="${removeAction}" data-value="${escapeHtml(value)}" aria-label="Remove ${escapeHtml(value)}">×</button>
    </span>`;
}

function renderPendingJournalTags() {
  $("#journal-tags-pending").innerHTML = pendingJournalTags
    .map((tag) => removableChipHtml(tag, "remove-pending-journal-tag"))
    .join("");
}

function addPendingJournalTag() {
  const input = $("#journal-tag-input");
  const value = input.value.trim();
  input.value = "";
  if (!value || pendingJournalTags.includes(value)) return;
  pendingJournalTags.push(value);
  renderPendingJournalTags();
}

function questionOptionChipHtml(question, option) {
  const selected = question.answer.includes(option);
  return `
    <span class="chip">
      <button type="button" class="chip-toggle" data-action="toggle-question-option" data-question-id="${question.id}" data-option="${escapeHtml(option)}" data-selected="${selected}">${escapeHtml(option)}</button>
      <button type="button" class="chip-remove" data-action="remove-question-option" data-question-id="${question.id}" data-option="${escapeHtml(option)}" aria-label="Remove option ${escapeHtml(option)}">×</button>
    </span>`;
}

function profileQuestionHtml(question) {
  const head = `
    <div class="question-head">
      <label>${escapeHtml(question.label)}</label>
      <button type="button" class="ghost small" data-action="delete-question" data-question-id="${question.id}">Delete</button>
    </div>`;

  if (question.type === "text") {
    return `
      <div class="row question-row" data-question-id="${question.id}">
        ${head}
        <textarea data-question-answer="${question.id}">${escapeHtml(question.answer)}</textarea>
      </div>`;
  }

  const chips = question.options.map((opt) => questionOptionChipHtml(question, opt)).join("");
  return `
    <div class="row question-row" data-question-id="${question.id}">
      ${head}
      <div class="chip-select">${chips || '<span class="hint">No options yet — add one below.</span>'}</div>
      <form class="inline small-form" data-action="add-question-option-form" data-question-id="${question.id}">
        <input type="text" placeholder="Add option" required />
        <button type="submit" class="small">Add</button>
      </form>
    </div>`;
}

function renderProfileQuestions() {
  renderList(
    $("#profile-questions-list"),
    state.profileQuestions,
    profileQuestionHtml,
    "No custom questions yet — add one below.",
  );
}

function truncate(text, max = 80) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function dashboardRecentRowHtml(item) {
  return `
    <div class="row">
      <div class="row-main">
        ${escapeHtml(item.title)}
        <span class="sub">${item.kind} · ${formatDate(item.createdAt)}</span>
      </div>
    </div>`;
}

function renderDashboard() {
  const name = state.profile?.name?.trim();
  $("#dash-greeting").textContent = name ? `Welcome back, ${name}` : "Welcome";
  $("#dash-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // state.habits already excludes archived ones.
  const logged = state.habits.filter((h) => h.currentPeriodStatus).length;
  $("#dash-habits-label").textContent = state.habits.length
    ? `Habits — ${logged}/${state.habits.length} logged`
    : "Habits";
  renderList(
    $("#dash-habits"),
    state.habits,
    dashboardHabitRowHtml,
    "No habits yet — add one on the Habits page.",
  );

  const recent = [
    ...state.journal.map((e) => ({ kind: "Journal", title: e.title, createdAt: e.createdAt })),
    ...state.thoughts.map((t) => ({
      kind: "Thought",
      title: truncate(t.title || t.content),
      createdAt: t.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  renderList($("#dash-recent"), recent, dashboardRecentRowHtml, "Nothing captured yet.");
}

function renderProfile() {
  const p = state.profile;
  $("#profile-name").value = p?.name ?? "";
  $("#profile-age").value = p?.age ?? "";
  $("#profile-location").value = p?.location ?? "";
  $("#profile-occupation").value = p?.occupation ?? "";
  $("#profile-bio").value = p?.bio ?? "";

  renderList(
    $("#profile-goals-list"),
    p?.goals ?? [],
    (goal) => removableChipHtml(goal, "remove-goal"),
    "No goals yet — add one below.",
  );
  renderList(
    $("#profile-challenges-list"),
    p?.challenges ?? [],
    (challenge) => removableChipHtml(challenge, "remove-challenge"),
    "No challenges yet — add one below.",
  );

  renderProfileQuestions();

  $("#profile-json").textContent = JSON.stringify(
    { ...p, customQuestions: state.profileQuestions },
    null,
    2,
  );
}

function renderHabits() {
  renderList($("#habits-list"), state.habits, habitRowHtml, "");
}

function renderJournal() {
  renderList($("#journal-list"), state.journal, journalEntryHtml, "No entries yet.");
}

function renderThoughts() {
  renderList($("#thoughts-list"), state.thoughts, thoughtEntryHtml, "No thoughts saved yet.");
}

function renderFiles() {
  renderList($("#files-list"), state.files, fileRowHtml, "No files uploaded yet.");

  const select = $("#file-journal-link");
  const current = select.value;
  select.innerHTML =
    `<option value="">None — standalone file</option>` +
    state.journal.map((e) => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join("");
  select.value = state.journal.some((e) => e.id === current) ? current : "";
}

function renderAll() {
  renderDashboard();
  renderProfile();
  renderHabits();
  renderJournal();
  renderThoughts();
  renderFiles();
}

async function refreshAll() {
  [state.profile, state.profileQuestions, state.habits, state.journal, state.thoughts, state.files] =
    await Promise.all([
      api("profile"),
      api("profile-questions"),
      api("habits"),
      api("journal?limit=200"),
      api("thoughts?limit=200"),
      api("files"),
    ]);
  renderAll();
}

// ---------- Uploading ----------

async function uploadFile({ title, description, file, journalEntryId }) {
  if (file.size > MAX_CLIENT_FILE_BYTES) {
    throw new Error(`"${file.name}" is ${formatBytes(file.size)}, which is over the 25MB limit.`);
  }
  const contentBase64 = await readFileAsBase64(file);
  await api("files", {
    method: "POST",
    body: {
      title,
      description: description || undefined,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      contentBase64,
      journalEntryId: journalEntryId || undefined,
    },
  });
}

// ---------- Form handlers ----------

$("#profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const ageValue = $("#profile-age").value.trim();
  const parsedAge = ageValue ? Number.parseInt(ageValue, 10) : undefined;

  if (ageValue && !Number.isFinite(parsedAge)) {
    alert(`"${ageValue}" doesn't look like a valid age. Please enter a number, or leave it blank.`);
    return;
  }

  try {
    await api("profile", {
      method: "PUT",
      body: {
        name: $("#profile-name").value || undefined,
        age: parsedAge,
        location: $("#profile-location").value || undefined,
        occupation: $("#profile-occupation").value || undefined,
        bio: $("#profile-bio").value || undefined,
      },
    });
    await refreshAll();
    flashButton(e.target.querySelector('button[type="submit"]'), "Saved!");
  } catch (err) {
    alert(`Couldn't save profile: ${err.message}`);
  }
});

$("#add-goal-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#new-goal");
  const value = input.value.trim();
  if (!value) return;
  const goals = state.profile?.goals ?? [];
  if (goals.includes(value)) {
    input.value = "";
    return;
  }
  try {
    await api("profile", { method: "PUT", body: { goals: [...goals, value] } });
    input.value = "";
    await refreshAll();
  } catch (err) {
    alert(`Couldn't add goal: ${err.message}`);
  }
});

$("#add-challenge-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#new-challenge");
  const value = input.value.trim();
  if (!value) return;
  const challenges = state.profile?.challenges ?? [];
  if (challenges.includes(value)) {
    input.value = "";
    return;
  }
  try {
    await api("profile", { method: "PUT", body: { challenges: [...challenges, value] } });
    input.value = "";
    await refreshAll();
  } catch (err) {
    alert(`Couldn't add challenge: ${err.message}`);
  }
});

$("#add-question-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("profile-questions", {
      method: "POST",
      body: {
        label: $("#new-question-label").value,
        type: $("#new-question-type").value,
      },
    });
    e.target.reset();
    await refreshAll();
    flashButton(e.target.querySelector('button[type="submit"]'), "Added!");
  } catch (err) {
    alert(`Couldn't add question: ${err.message}`);
  }
});

$("#save-question-answers").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const textQuestions = state.profileQuestions.filter((q) => q.type === "text");
  try {
    await Promise.all(
      textQuestions.map((q) => {
        const textarea = document.querySelector(`[data-question-answer="${q.id}"]`);
        return api(`profile-questions/${q.id}`, { method: "PATCH", body: { answer: textarea.value } });
      }),
    );
    await refreshAll();
    flashButton(btn, "Saved!");
  } catch (err) {
    alert(`Couldn't save answers: ${err.message}`);
  }
});

$("#toggle-profile-json").addEventListener("click", (e) => {
  const pre = $("#profile-json");
  pre.hidden = !pre.hidden;
  e.currentTarget.textContent = pre.hidden ? "Show JSON" : "Hide JSON";
});

$("#copy-profile-json").addEventListener("click", (e) => {
  copyToClipboard(JSON.stringify(state.profile, null, 2), e.currentTarget);
});

$("#copy-profile-path").addEventListener("click", (e) => {
  copyToClipboard(profilePath, e.currentTarget);
});

async function loadHabitsCsv() {
  const result = await api("habits/csv");
  habitsCsvContent = result.content;
  habitsCsvPath = result.path;
  $("#habits-csv").textContent = habitsCsvContent;
  $("#habits-csv-path-value").textContent = habitsCsvPath;
}

$("#toggle-habits-csv").addEventListener("click", async (e) => {
  const btn = e.currentTarget; // capture before any await -- currentTarget is nulled once dispatch finishes
  const pre = $("#habits-csv");
  if (pre.hidden) {
    try {
      await loadHabitsCsv();
      pre.hidden = false;
      btn.textContent = "Hide CSV";
    } catch (err) {
      alert(`Couldn't load habits CSV: ${err.message}`);
    }
  } else {
    pre.hidden = true;
    btn.textContent = "Show CSV";
  }
});

$("#copy-habits-csv").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  try {
    if (!habitsCsvContent) await loadHabitsCsv();
    copyToClipboard(habitsCsvContent, btn);
  } catch (err) {
    alert(`Couldn't load habits CSV: ${err.message}`);
  }
});

$("#copy-habits-csv-path").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  try {
    if (!habitsCsvPath) await loadHabitsCsv();
    copyToClipboard(habitsCsvPath, btn);
  } catch (err) {
    alert(`Couldn't load habits CSV: ${err.message}`);
  }
});

$("#habit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("habits", {
      method: "POST",
      body: {
        name: $("#habit-name").value,
        frequency: $("#habit-frequency").value,
      },
    });
    e.target.reset();
    await refreshAll();
    flashButton(e.target.querySelector('button[type="submit"]'), "Added!");
  } catch (err) {
    alert(`Couldn't add habit: ${err.message}`);
  }
});

async function loadArchivedHabits() {
  const all = await api("habits?includeArchived=true");
  renderList(
    $("#archived-habits-list"),
    all.filter((h) => h.archived),
    archivedHabitRowHtml,
    "No archived habits.",
  );
}

async function refreshArchivedHabitsIfVisible() {
  if (!$("#archived-habits-list").hidden) {
    await loadArchivedHabits();
  }
}

$("#toggle-archived-habits").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const list = $("#archived-habits-list");
  if (list.hidden) {
    try {
      await loadArchivedHabits();
      list.hidden = false;
      btn.textContent = "Hide archived habits";
    } catch (err) {
      alert(`Couldn't load archived habits: ${err.message}`);
    }
  } else {
    list.hidden = true;
    btn.textContent = "Show archived habits";
  }
});

$("#add-journal-tag").addEventListener("click", addPendingJournalTag);

$("#journal-tag-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault(); // don't submit the outer journal-form
  addPendingJournalTag();
});

$("#journal-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("journal", {
      method: "POST",
      body: {
        title: $("#journal-title").value,
        content: $("#journal-content").value,
        tags: pendingJournalTags,
      },
    });
    const submitBtn = e.target.querySelector('button[type="submit"]');
    e.target.reset();
    pendingJournalTags = [];
    renderPendingJournalTags();
    await refreshAll();
    flashButton(submitBtn, "Added!");
  } catch (err) {
    alert(`Couldn't add journal entry: ${err.message}`);
  }
});

$("#backfill-journal-summaries").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const status = $("#backfill-summary-status");
  try {
    const result = await api("journal/summaries/backfill", { method: "POST" });
    status.hidden = false;
    status.textContent = `Generated ${result.processed} summar${result.processed === 1 ? "y" : "ies"}, ${result.skipped} already had one${result.errors.length ? `, ${result.errors.length} failed` : ""}.`;
    await refreshAll();
    flashButton(btn, "Done!");
  } catch (err) {
    alert(`Couldn't backfill summaries: ${err.message}`);
  }
});

$("#dash-thought-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#dash-thought-content");
  try {
    await api("thoughts", { method: "POST", body: { content: input.value } });
    input.value = "";
    await refreshAll();
    flashButton(e.target.querySelector('button[type="submit"]'), "Saved!");
  } catch (err) {
    alert(`Couldn't save thought: ${err.message}`);
  }
});

$("#thought-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#thought-content");
  try {
    await api("thoughts", { method: "POST", body: { content: input.value } });
    input.value = "";
    await refreshAll();
    flashButton(e.target.querySelector('button[type="submit"]'), "Saved!");
  } catch (err) {
    alert(`Couldn't save thought: ${err.message}`);
  }
});

$("#file-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = $("#file-input").files[0];
  if (!file) return;
  try {
    await uploadFile({
      title: $("#file-title").value,
      description: $("#file-description").value,
      file,
      journalEntryId: $("#file-journal-link").value,
    });
    const submitBtn = e.target.querySelector('button[type="submit"]');
    e.target.reset();
    await refreshAll();
    flashButton(submitBtn, "Uploaded!");
  } catch (err) {
    alert(err.message);
  }
});

// Journal entries render their own "attach file" form dynamically, so it's handled via delegation.
// Journal entries and multiselect profile questions render their own forms
// dynamically (attach-file, add-option), so both are handled via delegation.
document.body.addEventListener("submit", async (e) => {
  const attachForm = e.target.closest(".attach-file-form");
  if (attachForm) {
    e.preventDefault();
    const file = attachForm.querySelector(".attach-input").files[0];
    if (!file) return;
    try {
      await uploadFile({
        title: attachForm.querySelector(".attach-title").value,
        description: attachForm.querySelector(".attach-description").value,
        file,
        journalEntryId: attachForm.dataset.journalEntryId,
      });
      await refreshAll();
    } catch (err) {
      alert(err.message);
    }
    return;
  }

  const summaryForm = e.target.closest(".edit-summary-form");
  if (summaryForm) {
    e.preventDefault();
    try {
      await api(`journal/${summaryForm.dataset.journalEntryId}/summary`, {
        method: "PUT",
        body: { summary: summaryForm.querySelector("textarea").value },
      });
      await refreshAll();
    } catch (err) {
      alert(`Couldn't save summary: ${err.message}`);
    }
    return;
  }

  const optionForm = e.target.closest('[data-action="add-question-option-form"]');
  if (optionForm) {
    e.preventDefault();
    const input = optionForm.querySelector("input");
    try {
      await api(`profile-questions/${optionForm.dataset.questionId}/options`, {
        method: "POST",
        body: { option: input.value },
      });
      await refreshAll();
    } catch (err) {
      alert(`Couldn't add option: ${err.message}`);
    }
  }
});

// ---------- Delegated actions (work in both the full section and the dashboard preview) ----------

document.body.addEventListener("click", async (e) => {
  try {
    const statusBtn = e.target.closest(".status-btn");
    if (statusBtn) {
      const habitId = statusBtn.closest(".status-group").dataset.habitId;
      await api(`habits/${habitId}/log`, { method: "POST", body: { status: statusBtn.dataset.status } });
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "generate-journal-summary") {
      await api(`journal/${e.target.dataset.id}/summary/generate`, { method: "POST" });
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "delete-journal") {
      const id = e.target.closest(".entry").dataset.id;
      await api(`journal/${id}`, { method: "DELETE" });
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "delete-thought") {
      const id = e.target.closest(".entry").dataset.id;
      await api(`thoughts/${id}`, { method: "DELETE" });
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "delete-file") {
      await api(`files/${e.target.dataset.fileId}`, { method: "DELETE" });
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "archive-habit") {
      await api(`habits/${e.target.dataset.habitId}`, { method: "PATCH", body: { archived: true } });
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "unarchive-habit") {
      await api(`habits/${e.target.dataset.habitId}`, { method: "PATCH", body: { archived: false } });
      await refreshAll();
      await refreshArchivedHabitsIfVisible();
      return;
    }

    if (e.target.dataset.action === "delete-habit") {
      if (!confirm("Delete this habit and its entire history? This can't be undone.")) return;
      await api(`habits/${e.target.dataset.habitId}`, { method: "DELETE" });
      await refreshAll();
      await refreshArchivedHabitsIfVisible();
      return;
    }

    if (e.target.dataset.action === "delete-question") {
      if (!confirm("Delete this question and its answer? This can't be undone.")) return;
      await api(`profile-questions/${e.target.dataset.questionId}`, { method: "DELETE" });
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "toggle-question-option") {
      const { questionId, option } = e.target.dataset;
      const question = state.profileQuestions.find((q) => q.id === questionId);
      const selected = question.answer.includes(option);
      const nextAnswer = selected ? question.answer.filter((o) => o !== option) : [...question.answer, option];
      await api(`profile-questions/${questionId}`, { method: "PATCH", body: { answer: nextAnswer } });
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "remove-question-option") {
      await api(
        `profile-questions/${e.target.dataset.questionId}/options?option=${encodeURIComponent(e.target.dataset.option)}`,
        { method: "DELETE" },
      );
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "remove-goal") {
      const goals = (state.profile?.goals ?? []).filter((g) => g !== e.target.dataset.value);
      await api("profile", { method: "PUT", body: { goals } });
      await refreshAll();
      return;
    }

    if (e.target.dataset.action === "remove-challenge") {
      const challenges = (state.profile?.challenges ?? []).filter((c) => c !== e.target.dataset.value);
      await api("profile", { method: "PUT", body: { challenges } });
      await refreshAll();
      return;
    }

    // The rest of these are local UI state, not server calls -- no refreshAll.
    if (e.target.dataset.action === "remove-pending-journal-tag") {
      pendingJournalTags = pendingJournalTags.filter((t) => t !== e.target.dataset.value);
      renderPendingJournalTags();
      return;
    }

    if (e.target.dataset.action === "select-export-format") {
      exportFormat = e.target.dataset.value;
      renderExportControls();
      return;
    }

    if (e.target.dataset.action === "toggle-export-section") {
      const value = e.target.dataset.value;
      if (exportSections.has(value)) exportSections.delete(value);
      else exportSections.add(value);
      renderExportSectionChips();
      const showJournalDetail = exportFormat !== "csv" && exportSections.has("journal");
      $("#export-journal-detail-chips").hidden = !showJournalDetail;
      $("#export-journal-detail-hint").hidden = showJournalDetail;
      return;
    }

    if (e.target.dataset.action === "select-export-range") {
      exportUseCustomRange = e.target.dataset.value === "custom";
      renderExportRangeChips();
      $("#export-date-fields").hidden = !exportUseCustomRange;
      return;
    }

    if (e.target.dataset.action === "select-export-journal-detail") {
      exportJournalDetail = e.target.dataset.value;
      renderExportJournalDetailChips();
    }
  } catch (err) {
    alert(`Something went wrong: ${err.message}`);
  }
});

// ---------- Data export tab ----------
// Local UI state only -- this tab has no persisted data of its own, so it
// doesn't participate in refreshAll(); it just calls POST /api/export on demand.

const EXPORT_FORMATS = [
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "csv", label: "CSV" },
];

const EXPORT_SECTIONS = [
  { value: "profile", label: "Profile" },
  { value: "journal", label: "Journal" },
  { value: "thoughts", label: "Thoughts" },
  { value: "habits", label: "Habits" },
  { value: "files", label: "Files" },
];

const EXPORT_MIME_TYPES = { markdown: "text/markdown", json: "application/json", csv: "text/csv" };
const EXPORT_EXTENSIONS = { markdown: "md", json: "json", csv: "csv" };

const EXPORT_JOURNAL_DETAILS = [
  { value: "full", label: "Full text" },
  { value: "summary", label: "Summaries" },
];

let exportFormat = "markdown";
let exportSections = new Set(EXPORT_SECTIONS.map((s) => s.value));
let exportUseCustomRange = false;
let exportJournalDetail = "full";
let exportResult = null;

function renderExportFormatChips() {
  $("#export-format-chips").innerHTML = EXPORT_FORMATS.map(
    (f) =>
      `<button type="button" class="choice-chip" data-action="select-export-format" data-value="${f.value}" data-selected="${f.value === exportFormat}">${f.label}</button>`,
  ).join("");
}

function renderExportSectionChips() {
  $("#export-section-chips").innerHTML = EXPORT_SECTIONS.map(
    (s) =>
      `<button type="button" class="choice-chip" data-action="toggle-export-section" data-value="${s.value}" data-selected="${exportSections.has(s.value)}">${s.label}</button>`,
  ).join("");
}

function renderExportRangeChips() {
  $("#export-range-chips").innerHTML = `
    <button type="button" class="choice-chip" data-action="select-export-range" data-value="all" data-selected="${!exportUseCustomRange}">All time</button>
    <button type="button" class="choice-chip" data-action="select-export-range" data-value="custom" data-selected="${exportUseCustomRange}">Custom range</button>`;
}

function renderExportJournalDetailChips() {
  $("#export-journal-detail-chips").innerHTML = EXPORT_JOURNAL_DETAILS.map(
    (d) =>
      `<button type="button" class="choice-chip" data-action="select-export-journal-detail" data-value="${d.value}" data-selected="${d.value === exportJournalDetail}">${d.label}</button>`,
  ).join("");
}

function renderExportControls() {
  renderExportFormatChips();
  renderExportRangeChips();
  renderExportJournalDetailChips();

  const isCsv = exportFormat === "csv";
  $("#export-section-chips").hidden = isCsv;
  $("#export-csv-hint").hidden = !isCsv;
  if (!isCsv) renderExportSectionChips();

  $("#export-date-fields").hidden = !exportUseCustomRange;

  const showJournalDetail = !isCsv && exportSections.has("journal");
  $("#export-journal-detail-chips").hidden = !showJournalDetail;
  $("#export-journal-detail-hint").hidden = isCsv || showJournalDetail;
}

function defaultExportFilename(format) {
  const date = new Date().toISOString().slice(0, 10);
  const base = format === "csv" ? "personal-context-habits" : "personal-context-export";
  return `${base}-${date}.${EXPORT_EXTENSIONS[format]}`;
}

function renderExportResult() {
  if (!exportResult) return;
  const { content, format, estimatedTokens } = exportResult;

  $("#export-result-format").textContent = format;
  $("#export-result-size").textContent = formatBytes(new Blob([content]).size);
  $("#export-result-tokens").textContent = String(estimatedTokens);
  $("#export-large-warning").hidden = estimatedTokens <= 8000;

  const pre = $("#export-preview");
  pre.textContent = content;
  pre.hidden = true;
  $("#toggle-export-preview").textContent = "Show preview";

  $("#export-filename").value = defaultExportFilename(format);
  $("#export-result").hidden = false;
}

function isValidFilename(name) {
  return name.trim().length > 0 && name.length <= 100 && !/[/\\:*?"<>|]/.test(name);
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

$("#generate-export").addEventListener("click", async (e) => {
  const btn = e.currentTarget;

  if (exportFormat !== "csv" && exportSections.size === 0) {
    alert("Select at least one category to include.");
    return;
  }

  const body = { format: exportFormat };
  if (exportFormat !== "csv") {
    body.sections = Array.from(exportSections);
    if (exportSections.has("journal")) body.journalDetail = exportJournalDetail;
  }
  if (exportUseCustomRange) {
    const from = $("#export-from").value;
    const to = $("#export-to").value;
    if (from) body.from = from;
    if (to) body.to = to;
  }

  try {
    exportResult = await api("export", { method: "POST", body });
    renderExportResult();
    flashButton(btn, "Generated!");
  } catch (err) {
    alert(`Couldn't generate export: ${err.message}`);
  }
});

$("#toggle-export-preview").addEventListener("click", (e) => {
  const pre = $("#export-preview");
  pre.hidden = !pre.hidden;
  e.currentTarget.textContent = pre.hidden ? "Show preview" : "Hide preview";
});

$("#copy-export-content").addEventListener("click", (e) => {
  if (!exportResult) return;
  copyToClipboard(exportResult.content, e.currentTarget);
});

$("#download-export-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!exportResult) return;
  const filename = $("#export-filename").value.trim();
  if (!isValidFilename(filename)) {
    alert('Enter a valid filename (no / \\ : * ? " < > | characters, 100 characters max).');
    return;
  }
  downloadTextFile(filename, exportResult.content, EXPORT_MIME_TYPES[exportResult.format]);
  flashButton(e.target.querySelector('button[type="submit"]'), "Downloaded!");
});

// ---------- Init ----------

async function loadProfilePath() {
  const result = await api("profile/path");
  profilePath = result.path;
  $("#profile-path-value").textContent = profilePath;
}

showView(location.hash.slice(1) || "dashboard");
renderExportControls();
refreshAll().catch((err) => console.error(err));
loadProfilePath().catch((err) => console.error(err));
