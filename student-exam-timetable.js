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

/* Direct-link support (same rule as the grades page / student-guard.js):
   1. sessionStorage student session -> fine.
   2. Else a still-valid 14-day "studentSession" in localStorage -> restore
      it into sessionStorage, no login needed.
   3. Else remember this page in "postLoginRedirect" (login.js returns the
      student here after login) and go to login. Relative target only. */
function ensureStudentSession() {
  try {
    let ok = sessionStorage.getItem("role") === "student" && !!sessionStorage.getItem("matric");
    if (!ok) {
      const raw   = localStorage.getItem("studentSession");
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && saved.role === "student" && saved.matric &&
          saved.expiresAt && Date.now() < saved.expiresAt) {
        sessionStorage.setItem("role", "student");
        sessionStorage.setItem("matric", saved.matric);
        if (saved.currentStudent) sessionStorage.setItem("currentStudent", saved.currentStudent);
        ok = true;
      }
    }
    if (ok) { sessionStorage.removeItem("postLoginRedirect"); return true; }
    sessionStorage.setItem("postLoginRedirect", location.pathname.split("/").pop() + location.search);
  } catch (e) { /* storage blocked: normal login flow */ }
  window.location.replace("login.html");
  return false;
}

function checkAuth() {
  if (!ensureStudentSession()) return;
  loadTimetable(sessionStorage.getItem("matric"));
}

// ============================================
// LOAD TIMETABLE
// ============================================
// Order of checks:
//   1. The student's CURRENT level + batch (students table) decide which
//      assessments are even eligible.
//   2. Courses the student is NOT registered for are still listed (so he
//      knows about them) but flagged _needsRegistration; the Enter button
//      leads to test-welcome.html, whose Attempt button opens the
//      "register first" modal.
// Carryover (course_access_overrides) and per-assessment grants
// (assessment_access_overrides) intentionally BYPASS the level/batch check,
// because they exist to give access to something outside the student's
// current level (e.g. an Intermediate carryover after promotion).

// true  = assessment batch must equal the student's batch (blank = open to all)
// false = only level is enforced; every batch of the same level/course shares the timetable
const STRICT_BATCH = true;

const norm = v => String(v ?? "").trim().toLowerCase();

async function loadTimetable(matric) {
  try {
    // 0. The student's current level + batch
    const { data: student, error: stuErr } = await db
      .from("students")
      .select("level_arabic, batch")
      .eq("matric_number", matric)
      .maybeSingle();

    if (stuErr) throw stuErr;

    const myLevel = norm(student && student.level_arabic);
    const myBatch = norm(student && student.batch);

    if (!myLevel) console.warn("Timetable: student has no level on record, level filter skipped.");

    // Blank level/batch on an assessment = open to all.
    const matchesLevelBatch = a => {
      if (myLevel) {
        const al = norm(a.level_arabic);
        if (al && al !== myLevel) return false;
      }
      if (STRICT_BATCH && myBatch) {
        const ab = norm(a.batch);
        if (ab && ab !== myBatch) return false;
      }
      return true;
    };

    // 1. Which courses is this student actually registered for?
    const { data: registrations, error: regErr } = await db
      .from("course_registrations")
      .select("course_id")
      .eq("matric_number", matric);

    if (regErr) throw regErr;

    const registeredCourseIds = (registrations || []).map(r => r.course_id).filter(Boolean);
    const registeredCourseSet = new Set(registeredCourseIds);

    // 1b. Course-level bypass (course_access_overrides): courses this
    //     student was granted access to directly, without a normal
    //     registration row (e.g. carryover/transfer).
    const { data: courseOverrides, error: courseOverrideErr } = await db
      .from("course_access_overrides")
      .select("course_id")
      .eq("matric_number", matric);

    if (courseOverrideErr) throw courseOverrideErr;

    const overrideCourseIds = (courseOverrides || []).map(o => o.course_id).filter(Boolean);
    const overrideCourseSet = new Set(overrideCourseIds);
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

    // 2. Pull assessments:
    //    (a) full history for the registered / bypassed courses, and
    //    (b) everything that hasn't ended yet (1-day margin for timezone
    //        safety), so assessments for the student's current level/batch
    //        show up even when he hasn't registered for the course, and
    //    (c) any individually-granted assessment ids.
    const selectCols = "id, title, description, course_id, type, duration_minutes, start_time, end_time, is_active, semester, course, level_arabic, batch, status, access_mode";

    let historyExams = [];
    if (courseIds.length) {
      const { data: ce, error: ceErr } = await db
        .from("assessments")
        .select(selectCols)
        .in("course_id", courseIds)
        .order("start_time", { ascending: true });
      if (ceErr) throw ceErr;
      historyExams = ce || [];
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: le, error: leErr } = await db
      .from("assessments")
      .select(selectCols)
      .gte("end_time", cutoff)
      .order("start_time", { ascending: true });
    if (leErr) throw leErr;
    const liveExams = le || [];

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
    [...historyExams, ...liveExams, ...extraExams].forEach(a => { examMap[a.id] = a; });
    const allExams = Object.values(examMap);

    // 2b. Gate:
    //     (a) "restricted" mode wins outright: only listed matrics see it;
    //     (b) course-level bypass (carryover) skips level/batch/registration;
    //     (c) otherwise the student's CURRENT level + batch must match, and
    //         if he isn't registered for that course the row is still shown,
    //         flagged _needsRegistration.
    //     (a per-assessment override row on an OPEN assessment is only a
    //      payment exception, so it grants no extra access here.)
    const data = [];
    allExams.forEach(a => {
      if (a.access_mode === 'restricted') {
        if (myOverrideSet.has(a.id)) data.push({ ...a, _needsRegistration: false });
        return;
      }

      if (a.course_id && overrideCourseSet.has(a.course_id)) {
        data.push({ ...a, _needsRegistration: false });
        return;
      }

      if (!matchesLevelBatch(a)) return;

      data.push({
        ...a,
        _needsRegistration: !!a.course_id && !registeredCourseSet.has(a.course_id)
      });
    });

    data.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    // 3. Which of these has this student already submitted (is_final = true)?
    const attemptedIds = await fetchAttemptedIds(matric, data.map(a => a.id));

    renderTimetable(data, attemptedIds);

  } catch (e) {
    console.error("Error loading timetable:", e);
  }
}


// ============================================
// ATTEMPTED ASSESSMENTS
// ============================================
// Same rule test-hall.js uses: an assessment counts as attempted once this
// student has a student_answers row with is_final = true. Paginated because
// student_answers holds one row per question and Supabase caps a response
// at 1000 rows. Never blocks the timetable if the lookup fails.

async function fetchAttemptedIds(matric, assessmentIds) {
  const attempted = new Set();
  if (!assessmentIds.length) return attempted;

  try {
    const PAGE = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await db
        .from("student_answers")
        .select("assessment_id")
        .eq("matric_number", matric)
        .eq("is_final", true)
        .in("assessment_id", assessmentIds)
        .order("assessment_id", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) throw error;

      (data || []).forEach(r => attempted.add(String(r.assessment_id)));

      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
  } catch (e) {
    console.error("Error checking attempted assessments:", e);
  }

  return attempted;
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
  if (status === "Attempted") {
    return `<span style="color: #0f766e; font-weight: bold;"><i class="fa-solid fa-circle-check"></i> Attempted</span>`;
  }

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

function renderTimetable(data, attemptedIds = new Set()) {
  const tbody = document.querySelector("#scheduleTable");

  if (!tbody) return;

  tbody.innerHTML = "";

  data.forEach(a => {
    const attempted = attemptedIds.has(String(a.id));
    const status = attempted ? "Attempted" : getStatus(a);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${a.title} (${a.type})</td>
      <td>${a.course}</td>
      <td>${a.level_arabic}</td>
      <td>${a.batch}</td>
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

    // Dim attempted rows so the next exam to take stands out
    if (status === "Attempted") {
      tr.style.opacity = "0.6";
    }

    tbody.appendChild(tr);
  });

  if (window.reTranslate) reTranslate();
}


// ============================================
// ENTER EXAM BUTTON LOGIC
// ============================================

// Small note shown under the action when the student is eligible by
// level/batch but hasn't registered for the course yet.
function regNote(a) {
  if (!a._needsRegistration) return "";
  return `<div style="font-size:0.78rem;color:#b45309;margin-top:4px;"><i class="fa-solid fa-triangle-exclamation"></i> <span data-translate="Course not registered">Course not registered</span></div>`;
}

function getActionButton(a, status) {
  if (status === "Attempted") {
    return `<span style="color: #0f766e;">Attempted</span>`;
  }

  if (status === "Ongoing") {
    return `
      <button class="btn btn-start" onclick="enterExam('${a.id}')">
        Enter Exam
      </button>
      ${regNote(a)}
    `;
  }

  if (status === "Upcoming") {
    return `<span style="color: #888;">Not yet</span>${regNote(a)}`;
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