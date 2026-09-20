// ===========================
// STAFF DASHBOARD JS
// ===========================
const db = window.supabaseClient;

// Single source of truth for currency symbols on this page — matches the
// set used across payments/fees elsewhere in the project.
function formatCurrency(amount, currency) {
  const symbols = { NGN: "₦", USD: "$", EUR: "€", GBP: "£", GHS: "GH₵", SLE: "Le " };
  const sym = symbols[currency] || currency || "₦";
  return `${sym}${Number(amount || 0).toLocaleString()}`;
}

// Groups rows by currency and formats each total — a staff member should
// almost always be paid in one currency, but this stays correct even if a
// record was entered in a different one, instead of silently summing raw
// numbers across currencies under one hardcoded symbol.
function formatGroupedTotals(rows, amountKey, defaultCurrency = "NGN") {
  const totals = {};
  (rows || []).forEach(r => {
    const cur = r.currency || defaultCurrency;
    totals[cur] = (totals[cur] || 0) + Number(r[amountKey] || 0);
  });
  const parts = Object.keys(totals).map(cur => formatCurrency(totals[cur], cur));
  return parts.length ? parts.join(" + ") : formatCurrency(0, defaultCurrency);
}

// Store teacher data globally
let teacherData = {
  id: null,
  name: null,
  email: null,
  role: null,
  courses: [],
  studentMatrics: [],
  registrations: [], // {matric_number, course_id, course_name, level, batch} — this teacher's own sections only
  studentNames: {}    // matric_number -> fullname
};

let allLeadsData = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // ===========================
    // STEP 1 — AUTH CHECK
    // ===========================
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) {
      window.location.href = "login.html";
      return;
    }

    // ===========================
    // STEP 2 — ROLE CHECK
    // ===========================
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || !["teacher", "admissions_officer"].includes(profile.role)) {
      alert(t("Access denied."));
      await db.auth.signOut();
      window.location.href = "login.html";
      return;
    }

    // ===========================
    // STEP 3 — STORE TEACHER DATA
    // ===========================
    teacherData.id = user.id;
    teacherData.name = profile.full_name || t("Teacher");
    teacherData.email = user.email;
    teacherData.role = profile.role;

    // ===========================
    // STEP 4 — GREET
    // ===========================
    const greetingEl = document.getElementById("staffGreeting");
    if (greetingEl) {
      greetingEl.textContent = `${t("Welcome")}, ${teacherData.name} 👋`;
    }

    const welcomeMsg = sessionStorage.getItem("welcomeMessage");
    if (welcomeMsg) {
      showBanner(welcomeMsg);
      sessionStorage.removeItem("welcomeMessage");
    }

    // ===========================
    // STEP 5 — LOAD EVERYTHING
    // ===========================
    await loadMyCourses(user.id);
    await populateGradeForm();
    await loadMyGrades();
    await loadMySchedule();
    loadProfileTab();
    wireGradeAutoTotal();
    enableGradeSearch();
    enableGradeFilters();
    enableGradeSorting();

    // The Leads tab (and its stat cards) only apply to Admissions Officers —
    // a teacher never sees them. Everything else on this page (Courses,
    // Grades, Schedule, Attendance, Payments) stays visible to BOTH roles:
    // an Admissions Officer who isn't currently assigned any students just
    // sees those tables empty, exactly like a newly added teacher would.
    const isAdmissionsOfficer = teacherData.role === "admissions_officer";
    document.querySelector("[onclick=\"switchTab('leads')\"]")
      ?.classList.toggle("hidden", !isAdmissionsOfficer);
    document.getElementById("tab-leads")
      ?.classList.toggle("hidden", !isAdmissionsOfficer);
    document.querySelectorAll(".leads-stat")
      .forEach(el => el.classList.toggle("hidden", !isAdmissionsOfficer));

    if (isAdmissionsOfficer) {
      enableLeadSearch();
      enableLeadStatusFilter();
    }

  } catch (err) {
    console.error("Staff dashboard error:", err);
  }
});

// ===========================
// TAB SWITCHING
// ===========================
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add("active");
  document.getElementById(`tab-${tab}`).classList.add("active");

  // Lazy-load payments tab
  if (tab === "payments") loadMyPayments();

  // Lazy-load attendance tab
  if (tab === "attendance") loadMyAttendanceSessions();

  // Lazy-load leads tab (Admissions Officer only)
  if (tab === "leads") loadLeads();
}

// ===========================
// MODAL HELPERS (used by the Leads tab)
// ===========================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("show");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("show");
}

// ===========================
// LEADS — LOAD + RENDER (Admissions Officer only)
// ===========================
async function loadLeads() {
  const tbody = document.querySelector("#leads-table tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" class="empty-state">
    <i class="fa-solid fa-spinner fa-spin"></i> ${t("Loading...")}
  </td></tr>`;

  try {
    const { data, error } = await db
      .from("admission_leads")
      .select("id, full_name, phone, email, source, status, notes, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    allLeadsData = data || [];
    renderLeadsTable(allLeadsData);
    updateLeadStats(allLeadsData);

  } catch (e) {
    console.error("Load leads error:", e);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${t("Failed to load leads")}</td></tr>`;
  }
}

function updateLeadStats(data) {
  const totalEl = document.getElementById("totalLeads");
  const followUpEl = document.getElementById("followUpLeads");
  const enrolledEl = document.getElementById("enrolledLeads");

  if (totalEl) totalEl.textContent = data.length;
  if (followUpEl) {
    followUpEl.textContent = data.filter(l =>
      ["new", "contacted", "follow_up"].includes(l.status)
    ).length;
  }
  if (enrolledEl) enrolledEl.textContent = data.filter(l => l.status === "enrolled").length;
}

function getLeadStatusBadgeClass(status) {
  const map = {
    new: "badge-info",
    contacted: "badge-warning",
    follow_up: "badge-warning",
    interested: "badge-success",
    enrolled: "badge-success",
    not_interested: "badge-danger"
  };
  return map[status] || "badge-default";
}

function formatLeadStatus(status) {
  const map = {
    new: t("New"),
    contacted: t("Contacted"),
    follow_up: t("Follow-up"),
    interested: t("Interested"),
    enrolled: t("Enrolled"),
    not_interested: t("Not Interested")
  };
  return map[status] || status;
}

function formatLeadSource(source) {
  const map = {
    whatsapp: t("WhatsApp"),
    website: t("Website"),
    referral: t("Referral"),
    other: t("Other")
  };
  return map[source] || source;
}

function renderLeadsTable(data) {
  const tbody = document.querySelector("#leads-table tbody");
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${t("No leads yet")}</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  data.forEach(lead => {
    const tr = document.createElement("tr");
    const statusBadge = getLeadStatusBadgeClass(lead.status);
    const addedDate = lead.created_at
      ? new Date(lead.created_at).toLocaleDateString()
      : "—";
    const notesPreview = lead.notes
      ? (lead.notes.length > 40 ? lead.notes.slice(0, 40) + "…" : lead.notes)
      : "—";

    tr.innerHTML = `
      <td>${lead.full_name || "—"}</td>
      <td>${lead.phone || "—"}</td>
      <td>${formatLeadSource(lead.source)}</td>
      <td><span class="badge ${statusBadge}">${formatLeadStatus(lead.status)}</span></td>
      <td title="${(lead.notes || "").replace(/"/g, "&quot;")}">${notesPreview}</td>
      <td>${addedDate}</td>
      <td>
        <button class="btn btn-edit" onclick="openEditLeadModal('${lead.id}')">
          <i class="fa-solid fa-pen"></i>
        </button>
      </td>
      <td>
        <button class="btn btn-delete" onclick="deleteLead('${lead.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  window.reTranslate?.();
}

// ===========================
// LEADS — SEARCH + FILTER
// ===========================
function enableLeadSearch() {
  const input = document.getElementById("searchLeads");
  if (!input) return;
  input.addEventListener("keyup", filterLeadsTable);
}

function enableLeadStatusFilter() {
  const select = document.getElementById("filterLeadStatus");
  if (!select) return;
  select.addEventListener("change", filterLeadsTable);
}

function filterLeadsTable() {
  const search = (document.getElementById("searchLeads")?.value || "").toLowerCase();
  const statusFilter = document.getElementById("filterLeadStatus")?.value || "";

  const filtered = allLeadsData.filter(lead => {
    const matchesSearch =
      (lead.full_name || "").toLowerCase().includes(search) ||
      (lead.phone || "").toLowerCase().includes(search) ||
      (lead.email || "").toLowerCase().includes(search);
    const matchesStatus = !statusFilter || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  renderLeadsTable(filtered);
}

// ===========================
// LEADS — ADD / EDIT / SAVE
// ===========================
let editingLeadId = null;

function openAddLeadModal() {
  editingLeadId = null;
  document.getElementById("leadModalTitle").textContent = t("Add Lead");
  document.getElementById("leadName").value = "";
  document.getElementById("leadPhone").value = "";
  document.getElementById("leadEmail").value = "";
  document.getElementById("leadSource").value = "whatsapp";
  document.getElementById("leadStatus").value = "new";
  document.getElementById("leadNotes").value = "";
  openModal("leadModal");
}

function openEditLeadModal(leadId) {
  const lead = allLeadsData.find(l => l.id === leadId);
  if (!lead) return;

  editingLeadId = leadId;
  document.getElementById("leadModalTitle").textContent = t("Edit Lead");
  document.getElementById("leadName").value = lead.full_name || "";
  document.getElementById("leadPhone").value = lead.phone || "";
  document.getElementById("leadEmail").value = lead.email || "";
  document.getElementById("leadSource").value = lead.source || "whatsapp";
  document.getElementById("leadStatus").value = lead.status || "new";
  document.getElementById("leadNotes").value = lead.notes || "";
  openModal("leadModal");
}

async function saveLead() {
  const btn = document.getElementById("saveLeadBtn");
  if (btn) { btn.disabled = true; }

  try {
    const full_name = document.getElementById("leadName")?.value.trim();
    const phone = document.getElementById("leadPhone")?.value.trim();
    const email = document.getElementById("leadEmail")?.value.trim();
    const source = document.getElementById("leadSource")?.value;
    const status = document.getElementById("leadStatus")?.value;
    const notes = document.getElementById("leadNotes")?.value.trim();

    if (!full_name || !phone) {
      alert(t("Full name and phone are required"));
      return;
    }

    const payload = {
      full_name,
      phone,
      email: email || null,
      source,
      status,
      notes: notes || null
    };

    let error;
    if (editingLeadId) {
      ({ error } = await db
        .from("admission_leads")
        .update(payload)
        .eq("id", editingLeadId));
    } else {
      ({ error } = await db
        .from("admission_leads")
        .insert([{ ...payload, created_by: teacherData.id }]));
    }

    if (error) throw error;

    showToast(editingLeadId ? t("Lead updated") : t("Lead added"));
    closeModal("leadModal");
    await loadLeads();

  } catch (e) {
    console.error("Save lead error:", e);
    alert(t("Failed to save lead. See console."));
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

async function deleteLead(leadId) {
  if (!confirm(t("Delete this lead? This cannot be undone."))) return;

  try {
    const { error } = await db
      .from("admission_leads")
      .delete()
      .eq("id", leadId);

    if (error) throw error;

    showToast(t("Lead deleted"));
    await loadLeads();

  } catch (e) {
    console.error("Delete lead error:", e);
    alert(t("Failed to delete lead."));
  }
}

// ===========================
// LOAD MY COURSES
// ===========================
// A teacher's courses now live in course_sections (course_id,
// instructor_id, batch) — a course can have several teacher+batch
// sections, not one instructor baked into the courses row. Which
// students belong to THIS teacher is now read straight off each
// registration's own section_id (see course_registrations.section_id),
// instead of comparing batch text — comparing text broke whenever this
// teacher had even one "open to all batches" section on a course, which
// made every batch on that course show up, including other teachers'.
// Levels similarly live in course_levels (a course can hold several),
// with courses.level kept only as a legacy fallback for older rows.
// This mirrors loadCoursesAdmin()/addCourseSection() in the admin
// dashboard.
async function loadMyCourses(teacherId) {
  const container = document.getElementById("coursesList");

  const { data: sections, error: sectionsError } = await db
    .from("course_sections")
    .select("id, course_id, batch")
    .eq("instructor_id", teacherId);

  if (sectionsError) {
    container.innerHTML = `<p style='color:red'>${t("Failed to load courses.")}</p>`;
    return;
  }

  if (!sections || sections.length === 0) {
    container.innerHTML = `<p class='empty-state'>${t("No courses assigned to you yet.")}</p>`;
    document.getElementById("totalCourses").textContent = 0;
    document.getElementById("totalStudents").textContent = 0;
    return;
  }

  // This teacher's own section ids, grouped by course — a registration
  // only belongs to this teacher if it's tied to one of THESE ids.
  const sectionIdsByCourse = {};
  sections.forEach(s => {
    if (!sectionIdsByCourse[s.course_id]) sectionIdsByCourse[s.course_id] = [];
    sectionIdsByCourse[s.course_id].push(s.id);
  });

  const courseIds = Object.keys(sectionIdsByCourse);

  const { data: courseRows, error: coursesError } = await db
    .from("courses")
    .select("id, course_name, level")
    .in("id", courseIds)
    .eq("deleted", false);

  if (coursesError) {
    container.innerHTML = `<p style='color:red'>${t("Failed to load courses.")}</p>`;
    return;
  }

  const { data: levelRows } = await db
    .from("course_levels")
    .select("course_id, level")
    .in("course_id", courseIds);

  const levelsByCourse = {};
  (levelRows || []).forEach(row => {
    if (!levelsByCourse[row.course_id]) levelsByCourse[row.course_id] = [];
    levelsByCourse[row.course_id].push(row.level);
  });

  // level here stays a single string (joined if multiple) since the
  // rest of this file — grade/schedule/attendance forms — reads
  // course.level as one value.
  const courses = (courseRows || []).map(c => ({
    id: c.id,
    course_name: c.course_name,
    level: (levelsByCourse[c.id] && levelsByCourse[c.id].length)
      ? levelsByCourse[c.id].join(", ")
      : (c.level || "")
  }));

  if (courses.length === 0) {
    container.innerHTML = `<p class='empty-state'>${t("No courses assigned to you yet.")}</p>`;
    document.getElementById("totalCourses").textContent = 0;
    document.getElementById("totalStudents").textContent = 0;
    return;
  }

  teacherData.courses = courses;
  document.getElementById("totalCourses").textContent = courses.length;

  let grandTotalStudents = 0;
  let allHTML = "";
  let allBatches = new Set(); // Collect all unique batches
  let allRegistrations = []; // {matric_number, course_id, course_name, level, batch} — this teacher's own registrations only
  let studentNames = {}; // matric_number -> fullname, for building grade-form dropdowns without another round trip

  for (const course of courses) {
    const mySectionIds = sectionIdsByCourse[course.id];

    const { data: registrations, error: regError } = await db
      .from("course_registrations")
      .select("matric_number, level, batch")
      .eq("course_id", course.id)
      .in("section_id", mySectionIds);

    if (regError) continue;

    registrations?.forEach(r => {
      allRegistrations.push({
        matric_number: r.matric_number,
        course_id: course.id,
        course_name: course.course_name,
        level: r.level,
        batch: r.batch
      });
    });

    const registeredMatrics = (registrations || []).map(r => r.matric_number);

    let students = [];

    if (registeredMatrics.length > 0) {
      const { data: studentRows, error: studentsError } = await db
        .from("students")
        .select("matric_number, fullname, email, level_arabic, batch, country, status")
        .in("matric_number", registeredMatrics)
        .eq("deleted", false);

      if (!studentsError) students = studentRows || [];
    }

    students.forEach(s => { studentNames[s.matric_number] = s.fullname; });


    const matricNumbers = students.map(s => s.matric_number);

    // Collect all matrics for grade form
    matricNumbers.forEach(m => {
      if (!teacherData.studentMatrics.includes(m)) {
        teacherData.studentMatrics.push(m);
      }
    });

    let studentsHTML = "";

    if (students.length === 0) {
      studentsHTML = `<tr>
        <td colspan="7" class="empty-state">${t("No students enrolled yet")}</td>
      </tr>`;
    } else {
      grandTotalStudents += students.length;

      // Collect batches for filter
      students.forEach(s => {
        if (s.batch) allBatches.add(s.batch);
      });

      studentsHTML = students.map(s => `
        <tr class="student-row" data-batch="${s.batch || ''}">
          <td>${s.matric_number}</td>
          <td>${s.fullname}</td>
          <td>${s.email}</td>
          <td>${s.country || "—"}</td>
          <td>${s.level_arabic || "—"}</td>
          <td>${s.batch || "—"}</td>
          <td>
            <span class="status-badge
              ${s.status === 'active' ? 'badge-active' : 'badge-inactive'}">
              ${t(s.status)}
            </span>
          </td>
        </tr>
      `).join("");
    }

    allHTML += `
      <div class="course-block">
        <div class="course-block-header">
          <h3>📖 ${course.course_name}</h3>
          <span class="level-badge">${course.level || "—"}</span>
          <span class="student-count">${students.length} ${t("student(s)")}</span>
        </div>
        <div class="table-container">
          <table class="staff-table">
            <thead>
              <tr>
                <th>${t("Matric Number")}</th>
                <th>${t("Name")}</th>
                <th>${t("Email")}</th>
                <th>${t("Country")}</th>
                <th>${t("Level")}</th>
                <th>${t("Batch")}</th>
                <th>${t("Status")}</th>
              </tr>
            </thead>
            <tbody>${studentsHTML}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  document.getElementById("totalStudents").textContent = grandTotalStudents;
  teacherData.registrations = allRegistrations;
  teacherData.studentNames = studentNames;

  // A registration with no section_id yet (never matched to a section
  // during the course_sections backfill) won't show for any teacher —
  // safer than guessing, but worth a visible nudge so it doesn't just
  // look like a missing student. Checked once across all of this
  // teacher's courses, not per course, to keep this to one extra query.
  const { count: unlinkedCount } = await db
    .from("course_registrations")
    .select("id", { count: "exact", head: true })
    .in("course_id", courseIds)
    .is("section_id", null);

  const unlinkedNotice = unlinkedCount
    ? `<p class="empty-state" style="color:#b45309;">
        ⚠️ ${unlinkedCount} ${t("registration(s) on your courses aren't linked to a section yet, so they won't show below until an admin fixes them.")}
       </p>`
    : "";

  container.innerHTML = unlinkedNotice + allHTML;
  
  // Populate batch filter dropdown
  populateBatchFilter(allBatches);
  
  enableSearch();
  enableBatchFilter();
}

// ===========================
// BATCH FILTER
// ===========================
function populateBatchFilter(batchSet) {
  const select = document.getElementById("filterBatch");
  if (!select) return;
  
  // Keep the "All Batches" option, clear the rest
  select.innerHTML = `<option value="" data-translate="All Batches">📦 All Batches</option>`;
  
  // Sort batches alphabetically and add them
  const sortedBatches = Array.from(batchSet).sort();
  sortedBatches.forEach(batch => {
    const option = document.createElement("option");
    option.value = batch;
    option.textContent = batch;
    select.appendChild(option);
  });
}

function enableBatchFilter() {
  const select = document.getElementById("filterBatch");
  const searchInput = document.getElementById("searchStudents");
  if (!select) return;

  select.addEventListener("change", () => {
    applyCombinedFilters();
  });

  // Also wire search to use combined filter
  if (searchInput) {
    searchInput.removeEventListener("keyup", applyCombinedFilters);
    searchInput.addEventListener("keyup", applyCombinedFilters);
  }
}

function applyCombinedFilters() {
  const batchValue = document.getElementById("filterBatch")?.value || "";
  const searchValue = document.getElementById("searchStudents")?.value.toLowerCase() || "";

  document.querySelectorAll(".student-row").forEach(row => {
    const rowBatch = row.dataset.batch || "";
    const rowText = row.textContent.toLowerCase();

    const matchesBatch = !batchValue || rowBatch === batchValue;
    const matchesSearch = !searchValue || rowText.includes(searchValue);

    row.style.display = (matchesBatch && matchesSearch) ? "" : "none";
  });
}

// ===========================
// POPULATE GRADE FORM
// ===========================
// Course-driven: which students show up (and their level/batch) always
// comes from teacherData.registrations — this teacher's own
// course_registrations rows — never from the student's live profile,
// which can drift the moment they're promoted to a new level/batch.
async function populateGradeForm() {
  const courseSelect = document.getElementById("gradeCourseSelect");
  const studentSelect = document.getElementById("gradeStudentSelect");
  if (!courseSelect || !studentSelect) return;

  courseSelect.innerHTML = `<option value="">${t("Select Course")}</option>` +
    teacherData.courses.map(c =>
      `<option value="${c.course_name}">${c.course_name}</option>`
    ).join("");

  resetGradeStudentSelect();

  courseSelect.addEventListener("change", () => populateGradeStudentsForCourse(courseSelect.value));
  studentSelect.addEventListener("change", () => {
    const selected = studentSelect.selectedOptions[0];
    document.getElementById("gradeLevelInput").value = selected?.dataset.level || "";
    document.getElementById("gradeBatchInput").value = selected?.dataset.batch || "";
  });
}

function resetGradeStudentSelect() {
  const studentSelect = document.getElementById("gradeStudentSelect");
  if (!studentSelect) return;
  studentSelect.innerHTML = `<option value="">${t("Select Course First")}</option>`;
  studentSelect.disabled = true;
  document.getElementById("gradeLevelInput").value = "";
  document.getElementById("gradeBatchInput").value = "";
}

// Only students actually registered under one of THIS teacher's own
// sections for the chosen course — with level/batch taken straight from
// that registration, not the student's current profile.
function populateGradeStudentsForCourse(courseName) {
  const studentSelect = document.getElementById("gradeStudentSelect");
  if (!studentSelect) return;

  document.getElementById("gradeLevelInput").value = "";
  document.getElementById("gradeBatchInput").value = "";

  if (!courseName) {
    resetGradeStudentSelect();
    return;
  }

  const regsForCourse = teacherData.registrations.filter(r => r.course_name === courseName);

  if (!regsForCourse.length) {
    studentSelect.innerHTML = `<option value="">${t("No students registered for this course")}</option>`;
    studentSelect.disabled = true;
    return;
  }

  studentSelect.disabled = false;
  studentSelect.innerHTML = `<option value="">${t("Select Student")}</option>` +
    regsForCourse.map(r => `
      <option value="${r.matric_number}" data-level="${r.level || ''}" data-batch="${r.batch || ''}">
        ${teacherData.studentNames[r.matric_number] || r.matric_number} (${r.matric_number})
      </option>
    `).join("");
}

// ===========================
// GRADE AUTO TOTAL
// ===========================
function wireGradeAutoTotal() {
  const assessment = document.getElementById("gradeAssessmentInput");
  const exam = document.getElementById("gradeExamInput");
  const total = document.getElementById("gradeTotalInput");
  if (!assessment || !exam || !total) return;

  const calc = () => {
    total.value = (Number(assessment.value || 0) + Number(exam.value || 0));
  };
  assessment.addEventListener("input", calc);
  exam.addEventListener("input", calc);
}

// ===========================
// SUBMIT GRADE
// ===========================
async function submitGrade() {
  const editId = document.getElementById("gradeEditId").value;
  const matric_number = document.getElementById("gradeStudentSelect").value;
  const course = document.getElementById("gradeCourseSelect").value;
  const level_arabic = document.getElementById("gradeLevelInput").value;
  const batch = document.getElementById("gradeBatchInput").value;
  const semester = document.getElementById("gradeSemesterSelect").value;
  const assessment_score = Number(document.getElementById("gradeAssessmentInput").value || 0);
  const exam_score = Number(document.getElementById("gradeExamInput").value || 0);
  const total_score = assessment_score + exam_score;
  const status = document.getElementById("gradeStatusSelect").value;
  const remark = document.getElementById("gradeRemarkSelect").value;

  if (!matric_number || !course || !semester) {
    alert(t("Please fill all required fields."));
    return;
  }

  const btn = document.querySelector(".grade-submit-btn");
  const btnTextEl = document.querySelector(".grade-submit-btn-text");
  if (btn) { btn.disabled = true; }
  if (btnTextEl) { btnTextEl.textContent = editId ? t("Updating...") : t("Submitting..."); }

  try {
    if (editId) {
      // released:false is part of the WHERE clause, not just the payload —
      // if the admin released this grade in the moment between the staff
      // opening the edit form and hitting Update, this simply matches zero
      // rows instead of silently overwriting a released grade.
      const { data, error } = await db
        .from("grades")
        .update({
          matric_number, course, level_arabic, batch, semester,
          assessment_score, exam_score, total_score, status, remark
        })
        .eq("id", editId)
        .eq("released", false)
        .select("id");

      if (error) throw error;

      if (!data || data.length === 0) {
        alert(t("This grade has already been released and can no longer be edited."));
      } else {
        showToast(t("Grade updated ✅"));
      }

      cancelGradeEdit();
    } else {
      const { error } = await db.from("grades").insert([{
        matric_number,
        course,
        level_arabic,
        batch,
        semester,
        assessment_score,
        exam_score,
        total_score,
        status,
        remark,
        released: false
      }]);

      if (error) throw error;

      showToast(t("Grade submitted ✅"));
      cancelGradeEdit();
    }

    await loadMyGrades();

  } catch (err) {
    console.error("Submit grade error:", err);
    if (err?.code === "23505") {
      // Postgres unique-violation — grades has a unique constraint on
      // (matric_number, course, semester, level_arabic), so this means a
      // grade for this exact combo already exists (e.g. a CBT assessment
      // already auto-graded it). Tell the teacher to edit it instead of
      // showing the raw constraint error.
      alert(t("A grade already exists for this student on this course, semester and level. Please edit the existing record instead of adding a new one."));
    } else {
      alert(t("Failed to submit grade."));
    }
  } finally {
    if (btn) { btn.disabled = false; }
    // Read current edit-mode state (not the pre-call snapshot) — on success
    // cancelGradeEdit() already cleared it; on failure it's still mid-edit.
    if (btnTextEl) {
      const stillEditing = document.getElementById("gradeEditId").value;
      btnTextEl.textContent = stillEditing ? t("Update Grade") : t("Submit Grade");
    }
  }
}

// ===========================
// LOAD MY GRADES (read-only)
// ===========================
async function loadMyGrades() {
  const tbody = document.getElementById("staffGradesBody");
  if (!tbody) return;

  const myCourseNames = teacherData.courses.map(c => c.course_name);

  if (!teacherData.studentMatrics.length || !myCourseNames.length) {
    tbody.innerHTML = `<tr>
      <td colspan="11" class="empty-state">${t("No students assigned yet.")}</td>
    </tr>`;
    return;
  }

  // .in("course", myCourseNames) is the scoping check that was missing —
  // without it, a student who shares a DIFFERENT course with a DIFFERENT
  // teacher would leak that other teacher's grade row in here too, since
  // matching on matric_number alone doesn't know which course a grade
  // actually belongs to.
  const { data: grades, error } = await db
    .from("grades")
    .select("id, matric_number, course, semester, assessment_score, exam_score, total_score, status, remark, released, level_arabic, batch")
    .in("matric_number", teacherData.studentMatrics)
    .in("course", myCourseNames)
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr>
      <td colspan="11" class="empty-state" style="color:red;">
        ${t("Failed to load grades.")}
      </td>
    </tr>`;
    return;
  }

  if (!grades || grades.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="11" class="empty-state">${t("No grades posted yet.")}</td>
    </tr>`;
    document.getElementById("totalGrades").textContent = 0;
    window.staffGradesCache = [];
    return;
  }

  // Cached so editStaffGrade() can populate the form without another
  // round trip, and so we can double-check a row's released state
  // client-side before letting the Edit button do anything.
  window.staffGradesCache = grades;

  const { data: students } = await db
    .from("students")
    .select("matric_number, fullname")
    .in("matric_number", teacherData.studentMatrics);

  const nameMap = {};
  (students || []).forEach(s => { nameMap[s.matric_number] = s.fullname; });

  // Batch/level for a grade come from the grade row itself (each grade
  // now snapshots them at posting time — see submitGrade()). Older rows
  // posted before grades.batch existed fall back to this teacher's own
  // registration record for that student+course, never the student's
  // current live profile, which is what caused batches to drift once a
  // student got promoted.
  function resolveBatch(g) {
    if (g.batch) return g.batch;
    const reg = teacherData.registrations.find(r => r.matric_number === g.matric_number && r.course_name === g.course);
    return reg?.batch || "";
  }

  document.getElementById("totalGrades").textContent = grades.length;

  tbody.innerHTML = grades.map(g => {
    const batch = resolveBatch(g);
    const studentName = nameMap[g.matric_number] || "";
    return `
    <tr class="grade-row"
        data-student="${(studentName || g.matric_number).toLowerCase()}"
        data-matric="${(g.matric_number || '').toLowerCase()}"
        data-level="${(g.level_arabic || '').toLowerCase()}"
        data-course="${g.course || ''}"
        data-batch="${batch}"
        data-semester="${(g.semester || '').toLowerCase()}"
        data-assessment-score="${g.assessment_score || 0}"
        data-exam-score="${g.exam_score || 0}"
        data-total-score="${g.total_score || 0}"
        data-remark="${(g.remark || '').toLowerCase()}"
        data-released="${g.released ? 'released' : 'pending'}">
      <td>${studentName || "—"}</td>
      <td>${g.matric_number}</td>
      <td>${g.level_arabic || "—"}</td>
      <td>${batch || "—"}</td>
      <td>${g.course}</td>
      <td>${g.semester}</td>
      <td>${g.assessment_score}</td>
      <td>${g.exam_score}</td>
      <td><strong>${g.total_score}</strong></td>
      <td>
        <span class="remark-badge remark-${g.remark}">
          ${t(g.remark)}
        </span>
      </td>
      <td>
        <span class="status-badge ${g.released ? 'badge-active' : 'badge-inactive'}">
          ${g.released ? t("Released") : t("Pending")}
        </span>
      </td>
      <td>
        ${g.released
          ? `<span style="color:var(--text-muted); font-size:0.85em; white-space:nowrap;">
               <i class="fa-solid fa-lock"></i> ${t("Locked")}
             </span>`
          : `<button class="btn btn-edit" onclick="editStaffGrade('${g.id}')">${t("Edit")}</button>`
        }
      </td>
    </tr>
  `;
  }).join("");

  populateGradeFilters(grades, resolveBatch);
}

// ===========================
// GRADE FILTERS (Course / Level / Batch / Released)
// ===========================
// Populates the dropdowns from whatever's actually in the current
// grades list, so a teacher only ever sees filter options that apply
// to them — same pattern as populateBatchFilter() on the courses tab.
function populateGradeFilters(grades, resolveBatch) {
  const courseSelect = document.getElementById("filterGradeCourse");
  const levelSelect = document.getElementById("filterGradeLevel");
  const batchSelect = document.getElementById("filterGradeBatch");
  if (!courseSelect || !levelSelect || !batchSelect) return;

  const courses = [...new Set(grades.map(g => g.course).filter(Boolean))].sort();
  const levels = [...new Set(grades.map(g => g.level_arabic).filter(Boolean))].sort();
  const batches = [...new Set(grades.map(g => resolveBatch(g)).filter(Boolean))].sort();

  const prevCourse = courseSelect.value;
  const prevLevel = levelSelect.value;
  const prevBatch = batchSelect.value;

  courseSelect.innerHTML = `<option value="" data-translate="All Courses">📘 ${t("All Courses")}</option>` +
    courses.map(c => `<option value="${c}">${c}</option>`).join("");

  levelSelect.innerHTML = `<option value="" data-translate="All Levels">🎓 ${t("All Levels")}</option>` +
    levels.map(l => `<option value="${l}">${l}</option>`).join("");

  batchSelect.innerHTML = `<option value="" data-translate="All Batches">📦 ${t("All Batches")}</option>` +
    batches.map(b => `<option value="${b}">${b}</option>`).join("");

  // Keep whatever was selected, if it's still a valid option after reload.
  if (courses.includes(prevCourse)) courseSelect.value = prevCourse;
  if (levels.includes(prevLevel)) levelSelect.value = prevLevel;
  if (batches.includes(prevBatch)) batchSelect.value = prevBatch;
}

function filterGradesTable() {
  const courseValue = document.getElementById("filterGradeCourse")?.value || "";
  const levelValue = (document.getElementById("filterGradeLevel")?.value || "").toLowerCase();
  const batchValue = document.getElementById("filterGradeBatch")?.value || "";
  const releasedValue = document.getElementById("filterGradeReleased")?.value || "";
  const searchValue = (document.getElementById("searchGrades")?.value || "").toLowerCase();

  document.querySelectorAll(".grade-row").forEach(row => {
    const matchesCourse = !courseValue || row.dataset.course === courseValue;
    const matchesLevel = !levelValue || row.dataset.level === levelValue;
    const matchesBatch = !batchValue || row.dataset.batch === batchValue;
    const matchesReleased = !releasedValue || row.dataset.released === releasedValue;
    const matchesSearch = !searchValue || row.textContent.toLowerCase().includes(searchValue);

    row.style.display = (matchesCourse && matchesLevel && matchesBatch && matchesReleased && matchesSearch) ? "" : "none";
  });
}

function enableGradeFilters() {
  ["filterGradeCourse", "filterGradeLevel", "filterGradeBatch", "filterGradeReleased"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", filterGradesTable);
  });
}

// ===========================
// SORT GRADES TABLE (tap a column header)
// ===========================
// Reorders the already-rendered <tr> elements in place (doesn't re-fetch
// or re-render), so it stays in sync with whatever the Course/Level/
// Batch/Released filters and search box currently have showing/hidden.
let gradeSortState = { key: null, direction: 1 };
const GRADE_SORT_NUMERIC_KEYS = new Set(["assessmentScore", "examScore", "totalScore"]);

function sortGradesTable(key) {
  const tbody = document.getElementById("staffGradesBody");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll(".grade-row"));
  if (!rows.length) return;

  if (gradeSortState.key === key) {
    gradeSortState.direction *= -1;
  } else {
    gradeSortState.key = key;
    gradeSortState.direction = 1;
  }

  const numeric = GRADE_SORT_NUMERIC_KEYS.has(key);

  rows.sort((a, b) => {
    const rawA = a.dataset[key] ?? "";
    const rawB = b.dataset[key] ?? "";

    if (numeric) {
      return (Number(rawA) - Number(rawB)) * gradeSortState.direction;
    }
    return rawA.localeCompare(rawB) * gradeSortState.direction;
  });

  rows.forEach(row => tbody.appendChild(row));

  document.querySelectorAll(".sortable-th").forEach(th => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sortKey === key) {
      th.classList.add(gradeSortState.direction === 1 ? "sort-asc" : "sort-desc");
    }
  });
}

function enableGradeSorting() {
  document.querySelectorAll(".sortable-th").forEach(th => {
    th.addEventListener("click", () => sortGradesTable(th.dataset.sortKey));
  });
}

// ===========================
// EDIT GRADE (staff) — only while unreleased
// ===========================
function editStaffGrade(id) {
  const g = (window.staffGradesCache || []).find(x => String(x.id) === String(id));
  if (!g) {
    // Cache is stale (list was refreshed/filtered since this button was
    // rendered) rather than the grade not existing — tell the teacher
    // instead of the button silently doing nothing, and refresh so the
    // cache is back in sync for their next click.
    alert(t("Couldn't find that grade — the list may have changed. Refreshing…"));
    loadMyGrades();
    return;
  }

  // Belt-and-braces: the Edit button is only rendered for unreleased rows,
  // but guard here too in case the cache is stale (e.g. admin released it
  // in another tab a moment ago and this page hasn't refreshed yet).
  if (g.released) {
    alert(t("This grade has already been released and can no longer be edited."));
    loadMyGrades();
    return;
  }

  document.getElementById("gradeEditId").value = g.id;
  document.getElementById("gradeCourseSelect").value = g.course;
  populateGradeStudentsForCourse(g.course); // rebuild the student list for this course before selecting one
  document.getElementById("gradeStudentSelect").value = g.matric_number;
  document.getElementById("gradeLevelInput").value = g.level_arabic || "";
  document.getElementById("gradeBatchInput").value = g.batch || "";

  document.getElementById("gradeSemesterSelect").value = g.semester;
  document.getElementById("gradeAssessmentInput").value = g.assessment_score;
  document.getElementById("gradeExamInput").value = g.exam_score;
  document.getElementById("gradeTotalInput").value = g.total_score;
  document.getElementById("gradeStatusSelect").value = g.status || "completed";
  document.getElementById("gradeRemarkSelect").value = g.remark;

  document.getElementById("gradeFormTitle").querySelector("span").textContent = t("Edit Grade");
  document.querySelector(".grade-submit-btn-text").textContent = t("Update Grade");
  document.getElementById("gradeCancelBtn").style.display = "";

  document.getElementById("gradeFormTitle").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelGradeEdit() {
  document.getElementById("gradeEditId").value = "";
  document.getElementById("gradeCourseSelect").value = "";
  resetGradeStudentSelect();
  document.getElementById("gradeSemesterSelect").value = "";
  document.getElementById("gradeAssessmentInput").value = "";
  document.getElementById("gradeExamInput").value = "";
  document.getElementById("gradeTotalInput").value = "";
  document.getElementById("gradeStatusSelect").value = "completed";
  document.getElementById("gradeRemarkSelect").value = "pass";

  document.getElementById("gradeFormTitle").querySelector("span").textContent = t("Post a Grade");
  document.querySelector(".grade-submit-btn-text").textContent = t("Submit Grade");
  document.getElementById("gradeCancelBtn").style.display = "none";
}

// ===========================
// SCHEDULE FORM STATE
// ===========================
let scheduleEditMode = false;

function openScheduleForm(existingRow = null) {
  const card = document.getElementById("scheduleFormCard");
  const title = document.getElementById("scheduleFormTitle");
  const saveBtn = document.getElementById("schedSaveBtnText");
  const editId = document.getElementById("scheduleEditId");

  // Populate course dropdown from teacher's courses
  const courseSelect = document.getElementById("schedCourseSelect");
  courseSelect.innerHTML = `<option value="">${t("Select Course")}</option>` +
    teacherData.courses.map(c =>
      `<option value="${c.course_name}" data-level="${c.level || ''}">${c.course_name}</option>`
    ).join("");

  // Wire course → level auto-fill
  courseSelect.onchange = () => {
    const opt = courseSelect.selectedOptions[0];
    document.getElementById("schedLevelInput").value = opt?.dataset.level || "";
  };

  if (existingRow) {
    scheduleEditMode = true;
    title.textContent = `📅 ${t("Edit Class")}`;
    saveBtn.textContent = t("Update Class");
    editId.value = existingRow.id;
    courseSelect.value = existingRow.course;
    document.getElementById("schedLevelInput").value = existingRow.level_arabic || "";
    document.getElementById("schedDateInput").value = existingRow.class_date || "";
    document.getElementById("schedTimeInput").value = existingRow.class_time || "";
    document.getElementById("schedLinkInput").value = existingRow.meeting_link || "";
    document.getElementById("schedStatusSelect").value = existingRow.status || "scheduled";
  } else {
    scheduleEditMode = false;
    title.textContent = `📅 ${t("Add Class")}`;
    saveBtn.textContent = t("Save Class");
    editId.value = "";
    courseSelect.value = "";
    document.getElementById("schedLevelInput").value = "";
    document.getElementById("schedDateInput").value = "";
    document.getElementById("schedTimeInput").value = "";
    document.getElementById("schedLinkInput").value = "";
    document.getElementById("schedStatusSelect").value = "scheduled";
  }

  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelScheduleForm() {
  document.getElementById("scheduleFormCard").style.display = "none";
  scheduleEditMode = false;
}

async function saveSchedule() {
  const course = document.getElementById("schedCourseSelect").value;
  const level_arabic = document.getElementById("schedLevelInput").value;
  const class_date = document.getElementById("schedDateInput").value;
  const class_time = document.getElementById("schedTimeInput").value;
  const meeting_link = document.getElementById("schedLinkInput").value.trim();
  const status = document.getElementById("schedStatusSelect").value;
  const editId = document.getElementById("scheduleEditId").value;

  if (!course || !class_date || !class_time) {
    alert(t("Please fill all required fields."));
    return;
  }

  const btn = document.querySelector("[onclick='saveSchedule()']");
  if (btn) { btn.disabled = true; }

  const payload = {
    course,
    level_arabic,
    class_date,
    class_time,
    meeting_link,
    status,
    deleted: false
  };

  try {
    let dbError;

    if (scheduleEditMode && editId) {
      const { error } = await db
        .from("schedule")
        .update(payload)
        .eq("id", editId);
      dbError = error;
    } else {
      const { error } = await db
        .from("schedule")
        .insert([payload]);
      dbError = error;
    }

    if (dbError) throw dbError;

    showToast(scheduleEditMode ? t("Schedule updated ✅") : t("Class added ✅"));
    cancelScheduleForm();
    await loadMySchedule();

  } catch (err) {
    console.error("Save schedule error:", err);
    alert(t("Failed to save schedule.") + " " + (err.message || ""));
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

// ===========================
// LOAD MY SCHEDULE
// ===========================
async function loadMySchedule() {
  const tbody = document.getElementById("staffScheduleBody");
  if (!tbody) return;

  if (!teacherData.courses.length) {
    tbody.innerHTML = `<tr>
      <td colspan="7" class="empty-state">${t("No courses assigned yet.")}</td>
    </tr>`;
    return;
  }

  const courseNames = teacherData.courses.map(c => c.course_name);

  const { data: schedule, error } = await db
    .from("schedule")
    .select("*")
    .in("course", courseNames)
    .eq("deleted", false)
    .order("class_date", { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr>
      <td colspan="7" class="empty-state" style="color:red;">
        ${t("Failed to load schedule.")}
      </td>
    </tr>`;
    return;
  }

  if (!schedule || schedule.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="7" class="empty-state">${t("No classes scheduled yet.")}</td>
    </tr>`;
    return;
  }

  tbody.innerHTML = schedule.map(c => `
    <tr>
      <td>${c.course}</td>
      <td>${c.level_arabic}</td>
      <td>${c.class_date}</td>
      <td>${c.class_time}</td>
      <td>
        ${c.meeting_link
          ? `<a href="${c.meeting_link}" target="_blank" class="join-btn">${t("Join")}</a>`
          : "—"}
      </td>
      <td>
        <span class="status-badge
          ${c.status === 'scheduled' ? 'badge-active' : 'badge-inactive'}">
          ${t(c.status)}
        </span>
      </td>
      <td>
        <button class="btn btn-save" style="padding:0.3rem 0.8rem;font-size:0.8rem;"
          onclick='openScheduleForm(${JSON.stringify(c)})'>
          <i class="fas fa-pen"></i> ${t("Edit")}
        </button>
      </td>
    </tr>
  `).join("");
}

// ===========================
// PROFILE TAB
// ===========================
async function loadProfileTab() {
  const nameEl  = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  const roleEl  = document.getElementById("profileRole");

  if (nameEl)  nameEl.value  = teacherData.name  || "";
  if (emailEl) emailEl.value = teacherData.email || "";
  const roleDisplayMap = { teacher: t("Teacher"), admissions_officer: t("Admissions Officer") };
  if (roleEl)  roleEl.value  = roleDisplayMap[teacherData.role] || t("Staff");

  const { data: profile } = await db
    .from("profiles")
    .select("passport_url, phone, country, state, address, department, staff_type, date_joined, monthly_salary, salary_currency")
    .eq("id", teacherData.id)
    .single();

  if (profile?.passport_url) {
    teacherData.passport_url = profile.passport_url;
    showAvatarImage(profile.passport_url);
  } else {
    showAvatarInitial(teacherData.name);
  }

  // New fields
  const phoneEl      = document.getElementById("profilePhone");
  const countryEl    = document.getElementById("profileCountry");
  const stateEl      = document.getElementById("profileState");
  const addressEl    = document.getElementById("profileAddress");
  const typeEl       = document.getElementById("profileStaffType");
  const deptEl       = document.getElementById("profileDepartment");
  const joinedEl     = document.getElementById("profileDateJoined");

  const typeMap = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", volunteer: "Volunteer" };
  const deptMap = { teaching: "Teaching", admin: "Admin", finance: "Finance", it: "IT" };

  if (phoneEl)   phoneEl.value   = profile?.phone || "—";
  if (countryEl) countryEl.value = profile?.country || "";
  if (stateEl)   stateEl.value   = profile?.state || "";
  if (addressEl) addressEl.value = profile?.address || "";
  if (typeEl)    typeEl.value    = typeMap[profile?.staff_type] || (profile?.staff_type || "—");
  if (deptEl)    deptEl.value    = deptMap[profile?.department] || (profile?.department || "—");
  if (joinedEl)  joinedEl.value  = profile?.date_joined || "—";

  // Store salary for payments tab
  teacherData.monthly_salary = profile?.monthly_salary || 0;
  teacherData.salary_currency = profile?.salary_currency || "NGN";

  // Role tag badge
  const tagMap = {
    mudeer: "#Director", assistant_mudeer: "#Asst. Director", h_o_d: "#Head of Dept.",
    bursar: "#Bursar", registrar: "#Registrar", teacher: "#Teacher",
    admissions_officer: "#Admissions Officer"
  };
  const classMap = {
    mudeer: "badge-success", assistant_mudeer: "badge-info",
    h_o_d: "badge-info",
    bursar: "badge-warning", registrar: "badge-default", teacher: "badge-teacher",
    admissions_officer: "badge-info"
  };
  const tagEl = document.getElementById("staffRoleTag");
  if (tagEl) {
    tagEl.textContent = tagMap[teacherData.role] || "#Staff";
    tagEl.className = `badge staff-role-tag ${classMap[teacherData.role] || "badge-default"}`;
  }
}

// ===========================
// SAVE PROFILE — also saves phone
// ===========================
async function saveProfile() {
  const newName = document.getElementById("profileName")?.value.trim();
  const newPhone = document.getElementById("profilePhone")?.value.trim();
  const newCountry = document.getElementById("profileCountry")?.value.trim();
  const newState = document.getElementById("profileState")?.value.trim();
  const newAddress = document.getElementById("profileAddress")?.value.trim();

  if (!newName) {
    alert(t("Name cannot be empty."));
    return;
  }

  const btn = document.querySelector("[onclick='saveProfile()']");
  if (btn) { btn.disabled = true; btn.textContent = t("Saving..."); }

  try {
    let passport_url = teacherData.passport_url || null;

    if (teacherData.pendingPhotoFile && teacherData.passport_url) {
      try {
        const oldPath = teacherData.passport_url.split("/passports/")[1];
        if (oldPath) {
          await db.storage.from("passports").remove([oldPath]);
        }
      } catch (e) {
        console.warn("Passport cleanup error:", e);
      }
    }

    if (teacherData.pendingPhotoFile) {
      const file = teacherData.pendingPhotoFile;
      const fileExt = file.name.split(".").pop();
      const fileName = `staff_${teacherData.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await db.storage
        .from("passports")
        .upload(fileName, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicData } = db.storage.from("passports").getPublicUrl(fileName);
      passport_url = publicData.publicUrl;
      teacherData.passport_url = passport_url;
      teacherData.pendingPhotoFile = null;
    }

    const { error } = await db
      .from("profiles")
      .update({
        full_name: newName,
        phone: newPhone || null,
        country: newCountry || null,
        state: newState || null,
        address: newAddress || null,
        ...(passport_url ? { passport_url } : {})
      })
      .eq("id", teacherData.id);

    if (error) throw error;

    teacherData.name = newName;
    sessionStorage.setItem("full_name", newName);

    const greetingEl = document.getElementById("staffGreeting");
    if (greetingEl) greetingEl.textContent = `${t("Welcome")}, ${newName} 👋`;

    if (passport_url) {
      showAvatarImage(passport_url);
    } else {
      showAvatarInitial(newName);
    }

    showToast(t("Profile saved ✅"));

  } catch (err) {
    console.error("Save profile error:", err);
    alert(t("Failed to save profile.") + " " + (err.message || ""));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t("Save Profile"); }
  }
}

// ===========================
// MY PAYMENTS TAB
// ===========================
async function loadMyPayments() {
  const tbody = document.getElementById("myPaymentsBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="empty-state">
    <i class="fa-solid fa-spinner fa-spin"></i> ${t("Loading payments...")}
  </td></tr>`;

  try {
    const { data, error } = await db
      .from("staff_payments")
      .select("*")
      .eq("staff_id", teacherData.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (error) throw error;

    // Update summary strip
    const monthlySalary = teacherData.monthly_salary || 0;
    const monthlyText = formatCurrency(monthlySalary, teacherData.salary_currency || "NGN");
    const monthlyEl = document.getElementById("paySummaryMonthly");
    monthlyEl.textContent = monthlyText;
    monthlyEl.dataset.original = monthlyText;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${t("No payment records yet.")}</td></tr>`;
      const pc0 = document.getElementById("paySummaryPaidCount");
      pc0.textContent = "0"; pc0.dataset.original = "0";
      const tp0 = document.getElementById("paySummaryTotalPaid");
      const zeroText = formatCurrency(0, teacherData.salary_currency || "NGN");
      tp0.textContent = zeroText; tp0.dataset.original = zeroText;
      return;
    }

    const months = ["", "January","February","March","April","May","June",
                    "July","August","September","October","November","December"];

    const paidRows = data.filter(p => p.status === "paid" || p.status === "partial");
    // Groups by each row's own currency (falling back to the staff member's
    // registered salary currency for old rows with none) rather than adding
    // raw numbers together regardless of what currency they were paid in.
    const totalPaidText = formatGroupedTotals(paidRows, "amount_paid", teacherData.salary_currency || "NGN");

    const paidCountEl = document.getElementById("paySummaryPaidCount");
    paidCountEl.textContent = paidRows.length;
    paidCountEl.dataset.original = String(paidRows.length);

    const totalPaidEl = document.getElementById("paySummaryTotalPaid");
    totalPaidEl.textContent = totalPaidText;
    totalPaidEl.dataset.original = totalPaidText;

    const statusClass = { paid: "badge-active", partial: "badge-warning-soft", unpaid: "badge-inactive" };

    tbody.innerHTML = data.map(p => `
      <tr>
        <td>${t(months[p.month] || p.month)}</td>
        <td>${p.year}</td>
        <td>${formatCurrency(p.amount_paid, p.currency || teacherData.salary_currency || "NGN")}</td>
        <td>${p.currency || teacherData.salary_currency || "NGN"}</td>
        <td>
          <span class="status-badge ${statusClass[p.status] || "badge-inactive"}">
            ${t(p.status)}
          </span>
        </td>
        <td>${p.paid_on || "—"}</td>
        <td>${p.note || "—"}</td>
      </tr>
    `).join("");

    window.reTranslate?.();

  } catch (e) {
    console.error("loadMyPayments error:", e);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${t("Failed to load payments.")}</td></tr>`;
  }
}

function showAvatarImage(url) {
  const img = document.getElementById("profileAvatarImg");
  const initial = document.getElementById("profileAvatarInitial");
  if (!img || !initial) return;

  img.src = url;
  img.classList.remove("hidden");
  initial.classList.add("hidden");

  const previewImg = document.getElementById("avatarPreviewImg");
  if (previewImg) previewImg.src = url;
}

function showAvatarInitial(name) {
  const img = document.getElementById("profileAvatarImg");
  const initial = document.getElementById("profileAvatarInitial");
  if (!img || !initial) return;

  img.classList.add("hidden");
  initial.classList.remove("hidden");
  initial.textContent = name
    ? name.charAt(0).toUpperCase()
    : "👤";
}

function openAvatarPreview() {
  const modal = document.getElementById("avatarPreviewModal");
  if (modal) modal.classList.remove("hidden");
}

function closeAvatarPreview() {
  const modal = document.getElementById("avatarPreviewModal");
  if (modal) modal.classList.add("hidden");
}

function handleAvatarChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert(t("Only image files are allowed."));
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert(t("Photo must not exceed 2MB."));
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    showAvatarImage(e.target.result);
  };
  reader.readAsDataURL(file);

  teacherData.pendingPhotoFile = file;
}

// (duplicate saveProfile() removed — the version above, which also
// saves the phone field, is the one now in effect)

// ===========================
// CHANGE PASSWORD
// ===========================
function togglePassword(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

async function changeMyPassword() {
  const newPassword = document.getElementById("newPassword")?.value;
  const confirmPassword = document.getElementById("confirmPassword")?.value;

  if (!newPassword || newPassword.length < 6) {
    alert(t("Password must be at least 6 characters."));
    return;
  }

  if (newPassword !== confirmPassword) {
    alert(t("Passwords do not match."));
    return;
  }

  const btn = document.querySelector("[onclick='changeMyPassword()']");
  if (btn) { btn.disabled = true; btn.textContent = t("Updating..."); }

  try {
    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) throw error;

    alert(t("Password updated successfully 🔐"));
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";

  } catch (err) {
    console.error(err);
    alert(t("Failed to update password."));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t("Update Password"); }
  }
}

// ===========================
// SEARCH — COURSES TAB
// ===========================
function enableSearch() {
  const input = document.getElementById("searchStudents");
  if (!input) return;
  input.addEventListener("keyup", () => {
    const filter = input.value.toLowerCase();
    document.querySelectorAll(".student-row").forEach(row => {
      row.style.display =
        row.textContent.toLowerCase().includes(filter) ? "" : "none";
    });
  });
}

// ===========================
// SEARCH — GRADES TAB
// ===========================
// Combined with the Course/Batch/Released dropdowns via
// filterGradesTable() — see enableGradeFilters() above.
function enableGradeSearch() {
  const input = document.getElementById("searchGrades");
  if (!input) return;
  input.addEventListener("keyup", filterGradesTable);
}

// ===========================
// TOAST
// ===========================
function showToast(msg) {
  const toast = document.getElementById("staff-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// ===========================
// WELCOME BANNER
// ===========================
function showBanner(message) {
  const banner = document.createElement("div");
  banner.innerHTML = `<strong>${message}</strong>`;
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%;
    background: #2b72ad; color: #fff;
    font-size: 1.2rem; font-weight: bold;
    text-align: center; padding: 1rem 0;
    z-index: 9999; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    transition: opacity 0.7s ease;
  `;
  document.body.appendChild(banner);
  setTimeout(() => {
    banner.style.opacity = "0";
    setTimeout(() => banner.remove(), 700);
  }, 5000);
}

// ===========================
// LOGOUT
// ===========================
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await db.auth.signOut();
    sessionStorage.clear();
    localStorage.removeItem("loginTime");
    window.location.href = "login.html";
  });
}

/* -------------------------------------------------------
   ATTENDANCE TAB (Teacher view)
   Same tables/RPCs as admin: attendance_sessions, attendance_records.
   Teachers only see/manage sessions where created_by = their own id.
------------------------------------------------------- */

let currentAttendanceRecords = []; // cached for CSV download
let currentAttendanceSessionTitle = "";

function formatAttendanceDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function formatForAttendanceInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generateAttendanceToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function buildAttendanceUrl(token) {
  return `${window.location.origin}/attendance.html?token=${token}`;
}

function populateAttendanceLevelDropdown() {
  const select = document.getElementById("attendanceLevel");
  if (!select) return;

  // Only the levels the teacher actually teaches (from their assigned courses)
  const levels = [...new Set((teacherData.courses || []).map(c => c.level).filter(Boolean))];

  select.innerHTML = `<option value="" data-translate="Choose Level">-- Choose Level --</option>` +
    levels.map(lv => `<option value="${lv}">${lv}</option>`).join("");
}

function openAttendanceForm() {
  document.getElementById("attendanceEditId").value = "";
  document.getElementById("attendanceTitle").value = "";
  document.getElementById("attendanceOpensAt").value = "";
  document.getElementById("attendanceClosesAt").value = "";
  document.getElementById("attendancePlatformLink").value = "";
  document.getElementById("attendanceLinkBox").style.display = "none";
  document.getElementById("attendanceFormTitle").querySelector("span").textContent = t("Create Attendance Session");

  populateAttendanceLevelDropdown();
  document.getElementById("attendanceFormCard").style.display = "block";
  document.getElementById("attendanceFormCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelAttendanceForm() {
  document.getElementById("attendanceFormCard").style.display = "none";
}

async function loadMyAttendanceSessions() {
  const tbody = document.getElementById("staffAttendanceBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="empty-state">
    <i class="fa-solid fa-spinner fa-spin"></i> ${t("Loading sessions...")}
  </td></tr>`;

  try {
    const { data: sessions, error } = await db
      .from("attendance_sessions")
      .select("*")
      .eq("created_by", teacherData.id)
      .order("opens_at", { ascending: false });

    if (error) throw error;

    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${t("No attendance sessions yet")}</td></tr>`;
      return;
    }

    const sessionIds = sessions.map(s => s.id);
    const { data: records } = await db
      .from("attendance_records")
      .select("session_id")
      .in("session_id", sessionIds);

    const countMap = {};
    (records || []).forEach(r => {
      countMap[r.session_id] = (countMap[r.session_id] || 0) + 1;
    });

    tbody.innerHTML = sessions.map(s => `
      <tr>
        <td>${s.title}</td>
        <td>${s.level}</td>
        <td>${formatAttendanceDate(s.opens_at)}</td>
        <td>${formatAttendanceDate(s.closes_at)}</td>
        <td>
          <button class="btn btn-edit" onclick="viewAttendanceRecords('${s.id}', '${s.title.replace(/'/g, "\\'")}')">
            ${countMap[s.id] || 0} <i class="fa-solid fa-eye"></i>
          </button>
        </td>
        <td>
          <label class="switch">
            <input type="checkbox" ${s.is_active ? "checked" : ""} onchange="toggleAttendanceSession('${s.id}', this.checked)">
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <button class="btn btn-edit" onclick="copySessionLinkDirect('${s.attendance_token}')" title="${t('Copy attendance link')}">
            <i class="fa-solid fa-link"></i>
          </button>
          <button class="btn btn-edit" onclick="editAttendanceSession('${s.id}')">
            ${t("Edit")}
          </button>
        </td>
      </tr>
    `).join("");

  } catch (e) {
    console.error("loadMyAttendanceSessions error:", e);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:red;">${t("Failed to load attendance sessions.")}</td></tr>`;
  }
}

async function addAttendanceSession() {
  const btn = document.getElementById("addAttendanceSessionBtn");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t("Please wait...")}`;

  try {
    const editId = document.getElementById("attendanceEditId").value;
    const title = document.getElementById("attendanceTitle").value.trim();
    const level = document.getElementById("attendanceLevel").value;
    const opensAtRaw = document.getElementById("attendanceOpensAt").value;
    const closesAtRaw = document.getElementById("attendanceClosesAt").value;
    const platformLink = document.getElementById("attendancePlatformLink").value.trim();

    if (!title || !level || !opensAtRaw || !closesAtRaw) {
      alert(t("Fill all required fields"));
      return;
    }

    const opensAt = new Date(opensAtRaw).toISOString();
    const closesAt = new Date(closesAtRaw).toISOString();

    if (new Date(closesAt) <= new Date(opensAt)) {
      alert(t("Closing time must be after opening time"));
      return;
    }

    if (editId) {
      const { error } = await db.from("attendance_sessions").update({
        title, level, opens_at: opensAt, closes_at: closesAt,
        platform_link: platformLink || null
      }).eq("id", editId).eq("created_by", teacherData.id); // can only edit own sessions

      if (error) throw error;
      showToast(t("Session updated"));
      cancelAttendanceForm();

    } else {
      const token = generateAttendanceToken();

      const { data, error } = await db.from("attendance_sessions").insert([{
        title, level, opens_at: opensAt, closes_at: closesAt,
        platform_link: platformLink || null,
        attendance_token: token,
        is_active: true,
        created_by: teacherData.id
      }]).select().single();

      if (error) throw error;

      showToast(t("Session created"));

      const linkBox = document.getElementById("attendanceLinkBox");
      const linkInput = document.getElementById("attendanceGeneratedLink");
      linkInput.value = buildAttendanceUrl(data.attendance_token);
      linkBox.style.display = "block";
    }

    loadMyAttendanceSessions();

  } catch (e) {
    console.error("Add/Edit attendance session error:", e);
    alert(t("Failed to save attendance session"));
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function editAttendanceSession(id) {
  const { data: s, error } = await db.from("attendance_sessions")
    .select("*").eq("id", id).eq("created_by", teacherData.id).single();

  if (error || !s) {
    alert(t("Failed to load session"));
    return;
  }

  populateAttendanceLevelDropdown();

  document.getElementById("attendanceFormTitle").querySelector("span").textContent = t("Edit Attendance Session");
  document.getElementById("attendanceEditId").value = id;
  document.getElementById("attendanceTitle").value = s.title;
  document.getElementById("attendanceLevel").value = s.level;
  document.getElementById("attendanceOpensAt").value = formatForAttendanceInput(s.opens_at);
  document.getElementById("attendanceClosesAt").value = formatForAttendanceInput(s.closes_at);
  document.getElementById("attendancePlatformLink").value = s.platform_link || "";

  const linkBox = document.getElementById("attendanceLinkBox");
  document.getElementById("attendanceGeneratedLink").value = buildAttendanceUrl(s.attendance_token);
  linkBox.style.display = "block";

  document.getElementById("attendanceFormCard").style.display = "block";
  document.getElementById("attendanceFormCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function toggleAttendanceSession(id, isActive) {
  const { error } = await db.from("attendance_sessions")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("created_by", teacherData.id);

  if (error) {
    alert(t("Failed to update session"));
    return;
  }
  showToast(isActive ? t("Session activated") : t("Session deactivated"));
}

function copySessionLinkDirect(token) {
  const url = buildAttendanceUrl(token);
  navigator.clipboard.writeText(url)
    .then(() => showToast(t("Link copied")))
    .catch(() => alert(url));
}

function copyAttendanceLink() {
  const linkInput = document.getElementById("attendanceGeneratedLink");
  if (!linkInput || !linkInput.value) return;
  navigator.clipboard.writeText(linkInput.value)
    .then(() => showToast(t("Link copied")))
    .catch(() => alert(linkInput.value));
}

async function viewAttendanceRecords(sessionId, sessionTitle) {
  currentAttendanceSessionTitle = sessionTitle;

  document.getElementById("attendanceRecordsTitle").querySelector("span").textContent =
    `${t("Attendance Records")} — ${sessionTitle}`;

  const tbody = document.getElementById("staffAttendanceRecordsBody");
  tbody.innerHTML = `<tr><td colspan="3" class="empty-state">${t("Loading...")}</td></tr>`;

  document.getElementById("attendanceRecordsCard").style.display = "block";
  document.getElementById("attendanceRecordsCard").scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const { data: records, error } = await db
  .from("attendance_records")
  .select("attended_at, student_matric")
  .eq("session_id", sessionId)
  .order("attended_at", { ascending: true });

    if (error) throw error;

    if (!records || records.length === 0) {
      currentAttendanceRecords = [];
      tbody.innerHTML = `<tr><td colspan="3" class="empty-state">${t("No one has marked attendance yet.")}</td></tr>`;
      return;
    }

    const matricNumbers = records.map(r => r.student_matric);

const { data: students } = await db
  .from("students")
  .select("matric_number, fullname")
  .in("matric_number", matricNumbers);

    const studentMap = {};
(students || []).forEach(s => {
  studentMap[s.matric_number] = s;
});

    currentAttendanceRecords = records.map(r => {
  const s = studentMap[r.student_matric] || {};

  return {
    matric_number: s.matric_number || "—",
    fullname: s.fullname || "—",
    attended_at: r.attended_at
  };
});

    tbody.innerHTML = currentAttendanceRecords.map(r => `
      <tr>
        <td>${r.matric_number}</td>
        <td>${r.fullname}</td>
        <td>${formatAttendanceDate(r.attended_at)}</td>
      </tr>
    `).join("");

  } catch (e) {
  console.error("viewAttendanceRecords error:", e);
  console.error("Full error:", JSON.stringify(e, null, 2));

    tbody.innerHTML = `<tr><td colspan="3" class="empty-state" style="color:red;">${t("Failed to load records.")}</td></tr>`;
  }
}

function closeAttendanceRecords() {
  document.getElementById("attendanceRecordsCard").style.display = "none";
}

function downloadAttendanceCsv() {
  if (!currentAttendanceRecords || currentAttendanceRecords.length === 0) {
    alert(t("No one has marked attendance yet."));
    return;
  }

  const header = "Matric Number,Name,Time\n";
  const rows = currentAttendanceRecords.map(r =>
    `"${r.matric_number}","${r.fullname}","${formatAttendanceDate(r.attended_at)}"`
  ).join("\n");

  const csvContent = header + rows;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const safeTitle = (currentAttendanceSessionTitle || "attendance").replace(/[^a-z0-9]+/gi, "_");
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeTitle}_attendance.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}