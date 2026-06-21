// ===========================
// STAFF DASHBOARD JS
// ===========================
const db = window.supabaseClient;

// Store teacher data globally
let teacherData = {
  id: null,
  name: null,
  email: null,
  role: null,
  courses: [],
  studentMatrics: []
};

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

    if (profileError || !profile || profile.role !== "teacher") {
      alert(t("Access denied. Teachers only."));
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
}

// ===========================
// LOAD MY COURSES
// ===========================
async function loadMyCourses(teacherId) {
  const container = document.getElementById("coursesList");

  const { data: courses, error: coursesError } = await db
    .from("courses")
    .select("id, course_name, level")
    .eq("instructor_id", teacherId);

  if (coursesError) {
    container.innerHTML = `<p style='color:red'>${t("Failed to load courses.")}</p>`;
    return;
  }

  if (!courses || courses.length === 0) {
    container.innerHTML = `<p class='empty-state'>${t("No courses assigned to you yet.")}</p>`;
    document.getElementById("totalCourses").textContent = 0;
    document.getElementById("totalStudents").textContent = 0;
    return;
  }

  teacherData.courses = courses;
  document.getElementById("totalCourses").textContent = courses.length;

  let grandTotalStudents = 0;
  let allHTML = "";

  for (const course of courses) {
    const { data: registrations, error: regError } = await db
      .from("course_registrations")
      .select("matric_number")
      .eq("course_id", course.id);

    if (regError) continue;

    const matricNumbers = (registrations || []).map(r => r.matric_number);

    // Collect all matrics for grade form
    matricNumbers.forEach(m => {
      if (!teacherData.studentMatrics.includes(m)) {
        teacherData.studentMatrics.push(m);
      }
    });

    let studentsHTML = "";

    if (matricNumbers.length === 0) {
      studentsHTML = `<tr>
        <td colspan="5" class="empty-state">${t("No students enrolled yet")}</td>
      </tr>`;
    } else {
      const { data: students, error: studentsError } = await db
        .from("students")
        .select("matric_number, fullname, email, level_arabic, country, status")
        .in("matric_number", matricNumbers)
        .eq("deleted", false);

      if (studentsError) {
        studentsHTML = `<tr>
          <td colspan="5" class="empty-state" style="color:red;">
            ${t("Failed to load courses.")}
          </td>
        </tr>`;
      } else {
        grandTotalStudents += (students || []).length;
        studentsHTML = (students || []).map(s => `
          <tr class="student-row">
            <td>${s.matric_number}</td>
            <td>${s.fullname}</td>
            <td>${s.email}</td>
            <td>${s.country || "—"}</td>
            <td>
              <span class="status-badge
                ${s.status === 'active' ? 'badge-active' : 'badge-inactive'}">
                ${t(s.status)}
              </span>
            </td>
          </tr>
        `).join("");
      }
    }

    allHTML += `
      <div class="course-block">
        <div class="course-block-header">
          <h3>📖 ${course.course_name}</h3>
          <span class="level-badge">${course.level || "—"}</span>
          <span class="student-count">${matricNumbers.length} ${t("student(s)")}</span>
        </div>
        <div class="table-container">
          <table class="staff-table">
            <thead>
              <tr>
                <th>${t("Matric Number")}</th>
                <th>${t("Name")}</th>
                <th>${t("Email")}</th>
                <th>${t("Country")}</th>
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
  container.innerHTML = allHTML;
  enableSearch();
}

// ===========================
// POPULATE GRADE FORM
// ===========================
async function populateGradeForm() {
  if (!teacherData.studentMatrics.length) return;

  const { data: students } = await db
    .from("students")
    .select("matric_number, fullname, level_arabic")
    .in("matric_number", teacherData.studentMatrics)
    .eq("deleted", false)
    .order("fullname");

  const studentSelect = document.getElementById("gradeStudentSelect");
  studentSelect.innerHTML = `<option value="">${t("Select Student")}</option>` +
    (students || []).map(s =>
      `<option value="${s.matric_number}"
        data-level="${s.level_arabic}">
        ${s.fullname} (${s.matric_number})
      </option>`
    ).join("");

  // Auto-fill level when student selected
  studentSelect.addEventListener("change", () => {
    const selected = studentSelect.selectedOptions[0];
    const level = selected?.dataset.level || "";
    document.getElementById("gradeLevelInput").value = level;
  });

  const courseSelect = document.getElementById("gradeCourseSelect");
  courseSelect.innerHTML = `<option value="">${t("Select Course")}</option>` +
    teacherData.courses.map(c =>
      `<option value="${c.course_name}">${c.course_name}</option>`
    ).join("");
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
  const matric_number = document.getElementById("gradeStudentSelect").value;
  const course = document.getElementById("gradeCourseSelect").value;
  const level_arabic = document.getElementById("gradeLevelInput").value;
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
  if (btn) { btn.disabled = true; btn.textContent = t("Submitting..."); }

  try {
    const { error } = await db.from("grades").insert([{
      matric_number,
      course,
      level_arabic,
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

    // Reset form
    document.getElementById("gradeStudentSelect").value = "";
    document.getElementById("gradeCourseSelect").value = "";
    document.getElementById("gradeLevelInput").value = "";
    document.getElementById("gradeSemesterSelect").value = "";
    document.getElementById("gradeAssessmentInput").value = "";
    document.getElementById("gradeExamInput").value = "";
    document.getElementById("gradeTotalInput").value = "";

    await loadMyGrades();

  } catch (err) {
    console.error("Submit grade error:", err);
    alert(t("Failed to submit grade."));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t("Submit Grade"); }
  }
}

// ===========================
// LOAD MY GRADES (read-only)
// ===========================
async function loadMyGrades() {
  const tbody = document.getElementById("staffGradesBody");
  if (!tbody) return;

  if (!teacherData.studentMatrics.length) {
    tbody.innerHTML = `<tr>
      <td colspan="9" class="empty-state">${t("No students assigned yet.")}</td>
    </tr>`;
    return;
  }

  const { data: grades, error } = await db
    .from("grades")
    .select("matric_number, course, semester, assessment_score, exam_score, total_score, remark, released, level_arabic")
    .in("matric_number", teacherData.studentMatrics)
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr>
      <td colspan="9" class="empty-state" style="color:red;">
        ${t("Failed to load grades.")}
      </td>
    </tr>`;
    return;
  }

  if (!grades || grades.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="9" class="empty-state">${t("No grades posted yet.")}</td>
    </tr>`;
    document.getElementById("totalGrades").textContent = 0;
    return;
  }

  const { data: students } = await db
    .from("students")
    .select("matric_number, fullname")
    .in("matric_number", teacherData.studentMatrics);

  const nameMap = {};
  (students || []).forEach(s => { nameMap[s.matric_number] = s.fullname; });

  document.getElementById("totalGrades").textContent = grades.length;

  tbody.innerHTML = grades.map(g => `
    <tr class="grade-row">
      <td>${nameMap[g.matric_number] || "—"}</td>
      <td>${g.matric_number}</td>
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
    </tr>
  `).join("");
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
  if (roleEl)  roleEl.value  = t("Teacher");

  const { data: profile } = await db
    .from("profiles")
    .select("passport_url, phone, department, staff_type, date_joined, monthly_salary")
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
  const typeEl       = document.getElementById("profileStaffType");
  const deptEl       = document.getElementById("profileDepartment");
  const joinedEl     = document.getElementById("profileDateJoined");

  const typeMap = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", volunteer: "Volunteer" };
  const deptMap = { teaching: "Teaching", admin: "Admin", finance: "Finance", it: "IT" };

  if (phoneEl)  phoneEl.value  = profile?.phone || "—";
  if (typeEl)   typeEl.value   = typeMap[profile?.staff_type] || (profile?.staff_type || "—");
  if (deptEl)   deptEl.value   = deptMap[profile?.department] || (profile?.department || "—");
  if (joinedEl) joinedEl.value = profile?.date_joined || "—";

  // Store salary for payments tab
  teacherData.monthly_salary = profile?.monthly_salary || 0;

  // Role tag badge
  const tagMap = {
    mudeer: "#Director", assistant_mudeer: "#Asst. Director", h_o_d: "#Head of Dept.",
    bursar: "#Bursar", registrar: "#Registrar", teacher: "#Teacher"
  };
  const classMap = {
    mudeer: "badge-success", assistant_mudeer: "badge-info",
    h_o_d: "badge-info",
    bursar: "badge-warning", registrar: "badge-default", teacher: "badge-teacher"
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
    // Update summary strip
    const monthlySalary = teacherData.monthly_salary || 0;
    const monthlyText = "₦" + Number(monthlySalary).toLocaleString();
    const monthlyEl = document.getElementById("paySummaryMonthly");
    monthlyEl.textContent = monthlyText;
    monthlyEl.dataset.original = monthlyText;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${t("No payment records yet.")}</td></tr>`;
      const pc0 = document.getElementById("paySummaryPaidCount");
      pc0.textContent = "0"; pc0.dataset.original = "0";
      const tp0 = document.getElementById("paySummaryTotalPaid");
      tp0.textContent = "₦0"; tp0.dataset.original = "₦0";
      return;
    }

    const months = ["", "January","February","March","April","May","June",
                    "July","August","September","October","November","December"];
    const symbols = { NGN: "₦", USD: "$", EUR: "€", GBP: "£" };

    const paidRows = data.filter(p => p.status === "paid" || p.status === "partial");
    const totalPaid = paidRows.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);

    const paidCountEl = document.getElementById("paySummaryPaidCount");
    paidCountEl.textContent = paidRows.length;
    paidCountEl.dataset.original = String(paidRows.length);

    const totalPaidText = "₦" + Math.round(totalPaid).toLocaleString();
    const totalPaidEl = document.getElementById("paySummaryTotalPaid");
    totalPaidEl.textContent = totalPaidText;
    totalPaidEl.dataset.original = totalPaidText;

    const statusClass = { paid: "badge-active", partial: "badge-warning-soft", unpaid: "badge-inactive" };

    tbody.innerHTML = data.map(p => `
      <tr>
        <td>${t(months[p.month] || p.month)}</td>
        <td>${p.year}</td>
        <td>${(symbols[p.currency] || p.currency || "₦") + Number(p.amount_paid || 0).toLocaleString()}</td>
        <td>${p.currency || "NGN"}</td>
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

async function saveProfile() {
  const newName = document.getElementById("profileName")?.value.trim();
  if (!newName) {
    alert(t("Name cannot be empty."));
    return;
  }

  const btn = document.querySelector("[onclick='saveProfile()']");
  if (btn) { btn.disabled = true; btn.textContent = t("Saving..."); }

  try {
    let passport_url = teacherData.passport_url || null;

    // ===========================
    // 1. DELETE OLD PASSPORT FIRST (OPTION 3)
    // ===========================
    if (teacherData.pendingPhotoFile && teacherData.passport_url) {

      try {
        const oldPath = teacherData.passport_url.split("/passports/")[1];

        if (oldPath) {
          const { error: deleteError } = await db.storage
            .from("passports")
            .remove([oldPath]);

          if (deleteError) {
            console.warn("Old passport delete failed:", deleteError.message);
          }
        }
      } catch (e) {
        console.warn("Passport cleanup error:", e);
      }
    }

    // ===========================
    // 2. UPLOAD NEW PASSPORT
    // ===========================
    if (teacherData.pendingPhotoFile) {
      const file = teacherData.pendingPhotoFile;
      const fileExt = file.name.split(".").pop();
      const fileName = `staff_${teacherData.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await db.storage
        .from("passports")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = db.storage
        .from("passports")
        .getPublicUrl(fileName);

      passport_url = publicData.publicUrl;

      teacherData.passport_url = passport_url;
      teacherData.pendingPhotoFile = null;
    }

    // ===========================
    // 3. UPDATE PROFILE TABLE
    // ===========================
    const { data, error } = await db
      .from("profiles")
      .update({
        full_name: newName,
        ...(passport_url ? { passport_url } : {})
      })
      .eq("id", teacherData.id)
      .select();

    console.log("UPDATED PROFILE:", data);

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
function enableGradeSearch() {
  const input = document.getElementById("searchGrades");
  if (!input) return;
  input.addEventListener("keyup", () => {
    const filter = input.value.toLowerCase();
    document.querySelectorAll(".grade-row").forEach(row => {
      row.style.display =
        row.textContent.toLowerCase().includes(filter) ? "" : "none";
    });
  });
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
