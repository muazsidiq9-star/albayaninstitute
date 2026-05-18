// ============================================
// SUPABASE CONFIG
// ============================================

const SUPABASE_URL = "https://cjrpjekmqrckozrbtwps.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);


// ============================================
// INIT
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();   // 🔥 add this
});

function checkAuth() {
  const matric = sessionStorage.getItem("matric");
  const role = sessionStorage.getItem("role");

  if (!matric || role !== "student") {
    alert("Student login required");
    window.location.href = "login.html";
    return;
  }

  loadTimetable(matric);
}

// ============================================
// LOAD TIMETABLE
// ============================================

async function loadTimetable(matric) {
  try {
    // get student level first
    const { data: student } = await db
      .from("students")
      .select("level_arabic")
      .eq("matric_number", matric)
      .single();

    if (!student) throw new Error("Student not found");

    const { data, error } = await db
      .from("assessments")
      .select("*")
      .eq("level_arabic", student.level_arabic) // 🔥 THIS IS THE KEY FIX
      .order("start_time", { ascending: true });

    if (error) throw error;

    renderTimetable(data);

  } catch (e) {
    console.error("Error loading timetable:", e);
  }
}


// ============================================
// STATUS LOGIC
// ============================================

function getStatus(a) {
  const now = new Date();
  const start = new Date(a.start_time);
  const end = new Date(a.end_time);

  if (now < start) return "Upcoming";
  if (now >= start && now <= end) return "Ongoing";
  return "Completed";
}


// ============================================
// STATUS BADGE
// ============================================

function getStatusBadge(status) {
  if (status === "Upcoming") {
    return `<span style="color: blue; font-weight: bold;">Upcoming</span>`;
  }

  if (status === "Ongoing") {
    return `<span style="color: green; font-weight: bold;">Ongoing</span>`;
  }

  return `<span style="color: gray;">Completed</span>`;
}


// ============================================
// FORMAT DATE
// ============================================

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString();
}


// ============================================
// RENDER TIMETABLE
// ============================================

function renderTimetable(data) {
  const tbody = document.querySelector("#scheduleTable");

  if (!tbody) return;

  tbody.innerHTML = "";

  data.forEach(a => {
    const status = getStatus(a);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${a.title} (${a.type})</td>
      <td>${a.course}</td>
      <td>${a.level_arabic}</td>
      <td>${a.semester}</td>
      <td>${a.type}</td>
      <td>${formatDate(a.start_time)}</td>
      <td>${formatDate(a.end_time)}</td>
      <td>${getStatusBadge(status)}</td>
      <td>${getActionButton(a, status)}</td>
    `;

    // Highlight ongoing exam
    if (status === "Ongoing") {
      tr.style.background = "var(--bg-color)";
    }

    tbody.appendChild(tr);
  });
}


// ============================================
// ENTER EXAM BUTTON LOGIC
// ============================================

function getActionButton(a, status) {
  if (status === "Ongoing") {
    return `
      <button class="btn btn-start" onclick="enterExam('${a.id}')">
        Enter Exam
      </button>
    `;
  }

  if (status === "Upcoming") {
    return `<span style="color: #888;">Not yet</span>`;
  }

  return `<span style="color: #aaa;">Closed</span>`;
}


// ============================================
// ENTER EXAM FUNCTION
// ============================================

function enterExam(assessmentId) {
  // Save assessment ID (important)
  localStorage.setItem("currentAssessmentId", assessmentId);

  // Redirect to exam page
  window.location.href = "test-welcome.html";
}
