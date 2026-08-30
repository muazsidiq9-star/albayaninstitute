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
  checkAuth();
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
    // 1. Which courses is this student actually registered for?
    const { data: registrations, error: regErr } = await db
      .from("course_registrations")
      .select("course_id")
      .eq("matric_number", matric);

    if (regErr) throw regErr;

    const registeredCourseIds = (registrations || []).map(r => r.course_id).filter(Boolean);

    // 1b. Course-level bypass (course_access_overrides): courses this
    //     student was granted access to directly, without a normal
    //     registration row (e.g. carryover/transfer).
    const { data: courseOverrides, error: courseOverrideErr } = await db
      .from("course_access_overrides")
      .select("course_id")
      .eq("matric_number", matric);

    if (courseOverrideErr) throw courseOverrideErr;

    const overrideCourseIds = (courseOverrides || []).map(o => o.course_id).filter(Boolean);
    const courseIds = [...new Set([...registeredCourseIds, ...overrideCourseIds])];

    // 1c. Per-assessment restriction (assessment_access_overrides): this
    //     student's own individually-granted assessment ids (e.g. a
    //     resit/makeup), which may belong to a course outside the lists
    //     above entirely.
    const { data: myAssessmentOverrides, error: myOverrideErr } = await db
      .from("assessment_access_overrides")
      .select("assessment_id")
      .eq("matric_number", matric);

    if (myOverrideErr) throw myOverrideErr;

    const myOverrideAssessmentIds = (myAssessmentOverrides || []).map(o => o.assessment_id);
    const myOverrideSet = new Set(myOverrideAssessmentIds);

    if (!courseIds.length && !myOverrideAssessmentIds.length) {
      renderTimetable([]);
      return;
    }

    // 2. Pull assessments for the courses this student registered for or
    //    was bypassed into, PLUS any individually-granted assessment ids
    //    that fall outside those courses entirely. Each course row already
    //    encodes its own level/batch, so this alone keeps Advanced and
    //    Intermediate exams from mixing, even if both courses share the
    //    same name.
    const selectCols = "id, title, description, course_id, type, duration_minutes, start_time, end_time, is_active, semester, course, status";

    let courseExams = [];
    if (courseIds.length) {
      const { data: ce, error: ceErr } = await db
        .from("assessments")
        .select(selectCols)
        .in("course_id", courseIds)
        .order("start_time", { ascending: true });
      if (ceErr) throw ceErr;
      courseExams = ce || [];
    }

    let extraExams = [];
    if (myOverrideAssessmentIds.length) {
      const { data: ee, error: eeErr } = await db
        .from("assessments")
        .select(selectCols)
        .in("id", myOverrideAssessmentIds);
      if (eeErr) throw eeErr;
      extraExams = ee || [];
    }

    const examMap = {};
    [...courseExams, ...extraExams].forEach(a => { examMap[a.id] = a; });
    const allExams = Object.values(examMap);

    // 2b. Find which of these are in "restricted mode" at all (ANY row in
    //     assessment_access_overrides) so a resit meant for one student
    //     doesn't show up on a classmate's timetable just because they
    //     happen to be registered for the same course.
    const allExamIds = allExams.map(a => a.id);
    const restrictedIdSet = new Set();
    if (allExamIds.length) {
      const { data: restrictionRows, error: restrictionErr } = await db
        .from("assessment_access_overrides")
        .select("assessment_id")
        .in("assessment_id", allExamIds);
      if (restrictionErr) throw restrictionErr;
      (restrictionRows || []).forEach(r => restrictedIdSet.add(r.assessment_id));
    }

    const data = allExams
      .filter(a => !restrictedIdSet.has(a.id) || myOverrideSet.has(a.id))
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

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