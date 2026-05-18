// ================================
// SUPABASE CONFIG
// ================================
const supabaseUrl = "https://cjrpjekmqrckozrbtwps.supabase.co";
const supabaseKey = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";
const db = supabase.createClient(supabaseUrl, supabaseKey);

let editingEntry = null;
let cachedEntries = [];
let lastDeletedEntry = null;
let undoTimer = null;

const saveBtn = document.getElementById("saveEntry");
const cancelBtn = document.getElementById("cancelEdit");

// ================================
// LOAD ENTRIES
// ================================
async function loadEntries() {
  const { data, error } = await db
    .from("semester_schedule")
    .select("*")
    .or("deleted.is.null,deleted.eq.false")
    .order("start_date", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  cachedEntries = data;
  populateFilters();
  renderEntries(data);
}

// ================================
// RENDER ENTRIES
// ================================
function renderEntries(entries) {
  const container = document.getElementById("entriesContainer");
  container.innerHTML = "";

  if (!entries.length) {
    container.innerHTML = "<p>No matching entries.</p>";
    return;
  }

  entries.forEach(entry => {
    const div = document.createElement("div");
    div.className = "entry-card";

    div.innerHTML = `
      <div class="entry-meta">
        ${entry.semester} • ${entry.type.replace("_", " ")}
      </div>
      <strong>${entry.title}</strong>
      <div>${entry.description || ""}</div>
      <div class="entry-meta">
        ${entry.start_date || ""} ${entry.end_date ? " → " + entry.end_date : ""}
      </div>
      <div class="entry-actions">
        <button class="btn btn-primary">Edit</button>
        <button class="btn btn-danger">Delete</button>
      </div>
    `;

    const [editBtn, deleteBtn] = div.querySelectorAll("button");

    editBtn.onclick = () => openEdit(entry);
    deleteBtn.onclick = () => deleteEntry(entry);

    container.appendChild(div);
  });
}

// ================================
// UNREAD COUNTER
// ================================
async function updateUnreadCounter() {
  const { count, error } = await db
    .from("contact_messages")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false)
    .eq("deleted", false);

  if (error) return console.error(error);

  const counter = document.getElementById("unreadCounter");
  if (counter) counter.textContent = count || 0;
}

// ================================
// FILTERS
// ================================
function populateFilters() {
  const semesterSelect = document.getElementById("filterSemester");
  const typeSelect = document.getElementById("filterType");

  if (!semesterSelect || !typeSelect) return;

  const semesters = [...new Set(cachedEntries.map(e => e.semester))];
  const types = [...new Set(cachedEntries.map(e => e.type))];

  semesterSelect.innerHTML = `<option value="">All Semesters</option>`;
  typeSelect.innerHTML = `<option value="">All Types</option>`;

  semesters.forEach(s =>
    semesterSelect.innerHTML += `<option value="${s}">${s}</option>`
  );

  types.forEach(t =>
    typeSelect.innerHTML += `<option value="${t}">${t.replace("_"," ")}</option>`
  );
}

function applyFilters() {
  const search = document.getElementById("searchInput")?.value.toLowerCase() || "";
  const semester = document.getElementById("filterSemester")?.value;
  const type = document.getElementById("filterType")?.value;

  let filtered = cachedEntries.filter(entry => {
    const matchesSearch =
      entry.title.toLowerCase().includes(search) ||
      (entry.description || "").toLowerCase().includes(search);

    const matchesSemester =
      !semester || entry.semester === semester;

    const matchesType =
      !type || entry.type === type;

    return matchesSearch && matchesSemester && matchesType;
  });

  renderEntries(filtered);
}

// Attach filters ONCE
document.getElementById("searchInput")?.addEventListener("input", applyFilters);
document.getElementById("filterSemester")?.addEventListener("change", applyFilters);
document.getElementById("filterType")?.addEventListener("change", applyFilters);

// ================================
// LOADING HELPERS
// ================================
function setLoading(button, text) {
  if (!button) return;
  button.dataset.originalText = button.textContent;
  button.textContent = text;
  button.disabled = true;
}

function resetLoading(button) {
  if (!button) return;
  button.textContent = button.dataset.originalText;
  button.disabled = false;
}

// ================================
// SAVE ENTRY
// ================================
document.getElementById("semesterForm").onsubmit = async e => {
  e.preventDefault();

  setLoading(saveBtn, "Saving...");

  const payload = {
    semester: document.getElementById("semester").value,
    type: document.getElementById("type").value,
    title: document.getElementById("title").value,
    description: document.getElementById("description").value,
    start_date: document.getElementById("start_date").value || null,
    end_date: document.getElementById("end_date").value || null
  };

  try {
    let response;

    if (editingEntry) {
      response = await db
        .from("semester_schedule")
        .update(payload)
        .eq("id", editingEntry.id);
    } else {
      response = await db
        .from("semester_schedule")
        .insert(payload);
    }

    if (response.error) throw response.error;

    resetForm();
    loadEntries();

  } catch (err) {
    console.error(err);
    alert("Save failed ❌");
  } finally {
    resetLoading(saveBtn);
  }
};

// ================================
// EDIT ENTRY
// ================================
function openEdit(entry) {
  editingEntry = entry;

  document.getElementById("semester").value = entry.semester;
  document.getElementById("type").value = entry.type;
  document.getElementById("title").value = entry.title;
  document.getElementById("description").value = entry.description;
  document.getElementById("start_date").value = entry.start_date || "";
  document.getElementById("end_date").value = entry.end_date || "";

  cancelBtn.style.display = "inline-block";

  document.getElementById("semesterForm").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  document.getElementById("title").focus();
}

// ================================
// DELETE + UNDO
// ================================
async function deleteEntry(entry) {
  if (!confirm("Delete entry?")) return;

  lastDeletedEntry = entry;

  const { error } = await db
    .from("semester_schedule")
    .update({ deleted: true })
    .eq("id", entry.id);

  if (error) {
    console.error(error);
    alert("Delete failed");
    return;
  }

  showUndoToast();
  loadEntries();
}

function showUndoToast() {
  clearTimeout(undoTimer);

  const toast = document.createElement("div");
  toast.className = "undo-toast";
  toast.innerHTML = `
    Entry deleted
    <button id="undoDelete">Undo</button>
  `;

  document.body.appendChild(toast);

  document.getElementById("undoDelete").onclick = undoDelete;

  undoTimer = setTimeout(() => {
    toast.remove();
    lastDeletedEntry = null;
  }, 5000);
}

async function undoDelete() {
  if (!lastDeletedEntry) return;

  const { error } = await db
    .from("semester_schedule")
    .update({ deleted: false })
    .eq("id", lastDeletedEntry.id);

  if (error) {
    console.error(error);
    alert("Undo failed");
    return;
  }

  document.querySelector(".undo-toast")?.remove();
  lastDeletedEntry = null;
  loadEntries();
}

// ================================
// RESET FORM
// ================================
function resetForm() {
  setLoading(cancelBtn, "Cancelling...");

  setTimeout(() => {
    document.getElementById("semesterForm").reset();
    editingEntry = null;
    cancelBtn.style.display = "none";
    resetLoading(cancelBtn);
  }, 250);
}

cancelBtn.onclick = resetForm;

// ================================
// INIT
// ================================
loadEntries();
updateUnreadCounter();