// ===========================
// Admin Guard (FIXED)
// ===========================
const db = window.supabaseClient;

/* -------------------------------------------------------
   LEVEL MAP — normalises any DB variant → select option
------------------------------------------------------- */
const LEVEL_MAP = {
  // English (matched case-insensitively)
  'preliminary'  : 'Preliminary',
  'beginner'     : 'Beginner',
  'intermediate' : 'Intermediate',
  'advanced'     : 'Advanced',

  "Preliminary": "التمهيدي",
"Beginner": "المبتدئ",
"Intermediate": "المتوسط",
"Advanced": "المتقدم",
"Choose Level": "اختر المستوى",

  // Arabic variants — add more here as you find them in Supabase
  'تمهيدي'       : 'Preliminary',
  'مبتدئ'        : 'Beginner',
  'مبتدئء'       : 'Beginner',
  'مبتديء'       : 'Beginner',
  'متوسط'        : 'Intermediate',
  'متقدم'        : 'Advanced',


};

/**
 * Sets a level <select> using the map so Arabic/variant
 * values from Supabase still match the English option text.
 */
function setLevel(selectId, rawValue) {
  if (!rawValue) return;
  const trimmed = rawValue.trim();
  // try lowercase (English variants), then exact (Arabic)
  const resolved = LEVEL_MAP[trimmed.toLowerCase()] || LEVEL_MAP[trimmed];
  console.log(`setLevel [${selectId}] raw: "${rawValue}" → resolved: "${resolved}"`);
  if (!resolved) return;

  const select = document.getElementById(selectId);
  if (!select) return;

  for (const opt of select.options) {
    // match by value OR visible text (handles options without explicit value attr)
    if (
      opt.value.toLowerCase() === resolved.toLowerCase() ||
      opt.textContent.trim().toLowerCase() === resolved.toLowerCase()
    ) {
      opt.selected = true;
      break;
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { data: { user }, error: authError } = await db.auth.getUser();

    if (authError || !user) {
      console.warn("Not authorized");
      window.location.href = "login.html";
      return;
    }

    const SESSION_TIMEOUT = 1000 * 60 * 60 * 6;
    const loginTime = localStorage.getItem("loginTime");

    if (!loginTime) {
      localStorage.setItem("loginTime", Date.now());
    } else {
      const now = Date.now();
      if (now - Number(loginTime) > SESSION_TIMEOUT) {
        await db.auth.signOut();
        sessionStorage.clear();
        localStorage.removeItem("loginTime");
        window.location.href = "login.html";
        return;
      }
    }

    const { data: profile, error: roleError } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role;

    if (roleError || !role) {
      alert(t("No role assigned"));
      console.warn("No role found");
      window.location.href = "login.html";
      return;
    }

    localStorage.setItem("loginTime", Date.now());

    sessionStorage.setItem("role", role);
    window.currentRole = role;

    console.log("Logged in as:", role);

    applyRolePermissions(role);
    applyActionRestrictions(role);
    restrictPasswordSections();

    // Init tab system + admin profile
    if (typeof window.initDashTabs === "function") window.initDashTabs();
    loadAdminProfile();

    setDashboardGreeting();

    await loadStats(role);

    if (role === "registrar") {
      loadStudents();
      loadPayments();
      loadFees();
      loadCoursesAdmin();
      loadDeletedStudents();
    }

    if (role === "bursar") {
      loadPayments();
      loadFees();
    }
    
    if (role === "h_o_d") {
      loadStudents();
      loadGrades();
      loadSchedule();
      loadAssessments();
      loadCoursesAdmin();
      loadDeletedStudents();
    }

    if (["mudeer", "assistant_mudeer"].includes(role)) {
      loadStudents();
      loadPayments();
      loadGrades();
      loadSchedule();
      loadAssessments();
      loadCoursesAdmin();
      loadFees();
      loadDeletedStudents();
    }

    populateStudentSelects();
    loadStudentDropdown();
    loadPasswordStudentDropdown();
    updateUnreadCounter();
    loadTeachers();

    enableTableSearch("searchStudents", "students-table");
    enableTableSearch("searchPayments", "payments-table");
    enableTableSearch("searchGrades", "grades-table");
    enableTableSearch("searchSchedule", "schedule-table");
    enableTableSearch("searchAssessments", "assessments-table");

    enableTableSorting("students-table");
    enableTableSorting("payments-table");
    enableTableSorting("grades-table");
    enableTableSorting("schedule-table");
    enableTableSorting("assessments-table");

    enableGradeAutoTotal();
    guardStudentsAccess();

  } catch (err) {
    console.error("Dashboard init error:", err);
  }
});

/* -------------------------------------------------------
   UTILITIES
------------------------------------------------------- */
function showToast(msg) {
  const toast = document.getElementById("admin-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function formatRole(role) {
  if (!role) return t("User");
  return role
    .replace("_", " ")
    .replace(/\b\w/g, l => l.toUpperCase());
}

function setDashboardGreeting() {
  const role = sessionStorage.getItem("role");
  const name = sessionStorage.getItem("full_name");

  const greetingEl = document.getElementById("dashboardGreeting");
  if (!greetingEl) return;

  const formattedRole = formatRole(role);
  const translatedRole = t(formattedRole);
  const welcome = t("Welcome");

  greetingEl.innerText = name
    ? `${welcome}, ${translatedRole} – ${name} 👋`
    : `${welcome}, ${translatedRole} 👋`;
}

/* -------------------------------------------------------
   UNREAD COUNTER
------------------------------------------------------- */
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

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  const form = modal.querySelector("form");
  if (form) form.reset();

  modal.querySelectorAll("input, select, textarea").forEach(el => {
    el.disabled = false;
  });

  const editMap = {
    studentModal: "editingStudentId",
    paymentModal: "editingPaymentId",
    gradeModal: "editingGradeId",
    scheduleModal: "editingScheduleId",
    assessmentModal: "editingAssessmentId",
    attendanceSessionModal: "editingAttendanceSessionId"
  };

  const key = editMap[id];
  if (key) window[key] = null;

  // Reset the "create" version of the attendance modal each time it's freshly opened
  if (id === "attendanceSessionModal" && !window.editingAttendanceSessionId) {
    const linkBox = document.getElementById("attendanceLinkBox");
    if (linkBox) linkBox.style.display = "none";
    const titleEl = document.getElementById("attendanceModalTitle");
    if (titleEl) titleEl.textContent = t("Create Attendance Session");
  }

  modal.classList.add("show");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.remove("show");

  // Clear stale certificate student context when certificate modal closes
  if (id === "certificateModal") window.certStudentData = null;

  const form = modal.querySelector("form");
  if (form) form.reset();

  modal.querySelectorAll("input, select, textarea").forEach(el => {
    el.disabled = false;
  });

  const editMap = {
    studentModal: "editingStudentId",
    paymentModal: "editingPaymentId",
    gradeModal: "editingGradeId",
    scheduleModal: "editingScheduleId",
    assessmentModal: "editingAssessmentId",
    attendanceSessionModal: "editingAttendanceSessionId"
  };

  const key = editMap[id];
  if (key) window[key] = null;
}

function togglePassword(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

function setLoading(btn, loading = true) {
  if (!btn) return;
  btn.disabled = loading;
  btn.dataset.text ||= btn.textContent;
  btn.textContent = loading ? t("Please wait...") : btn.dataset.text;
}

let studentsCache = [];

async function loadStudentsCache() {
  if (studentsCache.length > 0) return studentsCache;

  const { data, error } = await db
    .from("students")
    .select("matric_number, fullname, level_arabic")
    .eq("deleted", false);

  if (error) {
    console.error("Failed to load students cache:", error);
    return [];
  }
  studentsCache = data || [];
  return studentsCache;
}

function applyRolePermissions(role) {
  const permissions = {
    registrar: ["students", "payments", "student_fee_status", "courses", "course_registrations"],
    bursar: ["payments", "student_fee_status"],
    h_o_d: ["students", "courses", "course_registrations", "grades", "schedule", "assessments"],
    mudeer: ["students", "payments", "student_fee_status", "courses", "course_registrations", "grades", "schedule", "assessments"],
    assistant_mudeer: ["students", "payments", "student_fee_status", "courses", "course_registrations", "grades", "schedule", "assessments"]
  };

  const allowed = permissions[role] || [];

  const sections = {
    students: document.querySelector("#students-table")?.closest("section"),
    payments: document.querySelector("#payments-table")?.closest("section"),
    grades: document.querySelector("#grades-table")?.closest("section"),
    schedule: document.querySelector("#schedule-table")?.closest("section"),
    assessments: document.querySelector("#assessments-table")?.closest("section"),
    courses: document.querySelector("#adminCoursesList")?.closest("section"),
    student_fee_status: document.querySelector("#feeTable")?.closest("section")
  };

  Object.entries(sections).forEach(([key, el]) => {
    if (!el) return;
    el.style.display = allowed.includes(key) ? "block" : "none";
  });
}

function applyActionRestrictions(role) {
  const roleUI = {
    mudeer: ["all"],
    assistant_mudeer: ["all"],
    h_o_d: ["students", "courses", "course_registrations", "grades", "schedule", "assessments"],
    registrar: ["students", "payments", "student_fee_status", "courses", "course_registrations"],
    bursar: ["payments", "student_fee_status"]
  };

  window.canDo = (section) => {
    return (
      roleUI[role]?.includes("all") ||
      roleUI[role]?.includes(section)
    );
  };
}

function guardStudentsAccess() {
  if (typeof window.canDo !== "function") {
    console.warn("canDo not ready yet");
    return;
  }
  if (!window.canDo("students")) {
    alert(t("Manage Your Office"));
    return;
  }
}

function guardPaymentAccess() {
  if (typeof window.canDo !== "function") {
    console.warn("canDo not ready yet");
    return;
  }
  if (!window.canDo("payments")) {
    alert(t("Manage Your Office"));
    return;
  }
}

function restrictPasswordSections() {
  const role = window.currentRole;
  const allowedRoles = ["mudeer", "assistant_mudeer"];
  if (!allowedRoles.includes(role)) {
    document.querySelectorAll(".password-card").forEach(el => {
      el.style.display = "none";
    });
  }
}

/* -------------------------------------------------------
   NOTIFICATIONS
------------------------------------------------------- */
async function sendNotification(matric, title, message) {
  await db.from("notifications").insert([{
    matric_number: matric,
    title: title,
    message: message,
    created_at: new Date()
  }]);
}

document.addEventListener("DOMContentLoaded", () => {
  const message = sessionStorage.getItem("welcomeMessage");
  if (!message) return;

  const banner = document.createElement("div");
  banner.innerHTML = `<strong>${message}</strong>`;

  banner.style.position = "fixed";
  banner.style.top = "0";
  banner.style.left = "0";
  banner.style.width = "100%";
  banner.style.background = "#2b72ad";
  banner.style.color = "#fff";
  banner.style.fontSize = "1.2rem";
  banner.style.fontWeight = "bold";
  banner.style.textAlign = "center";
  banner.style.padding = "1rem 0";
  banner.style.zIndex = "9999";
  banner.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
  banner.style.transition = "opacity 0.7s ease";

  document.body.appendChild(banner);

  setTimeout(() => {
    banner.style.opacity = "0";
    setTimeout(() => banner.remove(), 700);
  }, 5000);

  sessionStorage.removeItem("welcomeMessage");
});

/* -------------------------------------------------------
   STATS
------------------------------------------------------- */
async function loadStats(role) {
  try {
    const { count: studentCount, error: sErr } = await db
      .from("students")
      .select("*", { count: "exact", head: true });

    if (!sErr) {
      document.getElementById("totalStudents").textContent = studentCount || 0;
    }

    // ❌ BLOCK payment stats for restricted roles
    const canViewPayments = ["mudeer", "assistant_mudeer", "bursar", "registrar"].includes(role);

    if (!canViewPayments) {
      document.getElementById("totalPayments").textContent = "—";
      document.getElementById("totalAmountPaid").textContent = "—";
      return;
    }

    // continue payment logic only if allowed
    let rates = { NGN: 1, USD: 1600, EUR: 1750, GBP: 2000 };

    try {
      const ratesRes = await fetch("https://api.exchangerate-api.com/v4/latest/NGN");
      if (ratesRes.ok) {
        const ratesData = await ratesRes.json();
        rates = { NGN: 1 };
        for (const [currency, rate] of Object.entries(ratesData.rates)) {
          rates[currency] = 1 / rate;
        }
      }
    } catch (rateErr) {
      console.warn("Could not fetch live rates, using fallback:", rateErr);
    }

    const { data: payments, error: pErr } = await db
      .from("payments")
      .select("amount, currency");

    if (!pErr && payments) {
      document.getElementById("totalPayments").textContent = payments.length;

      const totalNGN = payments.reduce((sum, p) => {
        const currency = p.currency || "NGN";
        const rate = rates[currency] || 1;
        return sum + (Number(p.amount || 0) * rate);
      }, 0);

      document.getElementById("totalAmountPaid").textContent =
        "₦" + Math.round(totalNGN).toLocaleString();
    }

  } catch (e) {
    console.error("Stats error:", e);
  }
}

/* -------------------------------------------------------
   STUDENTS
------------------------------------------------------- */
async function loadStudents() {
  const { data } = await db
    .from("students")
    .select("*")
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  const tbody = document.querySelector("#students-table tbody");
  if (!tbody) return;

  if (!window.editingStudentId) {
    tbody.innerHTML = "";

    data?.forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          ${s.passport_url
            ? `<img src="${s.passport_url}" class="passport-thumb" onclick="openPassportModal('${s.passport_url}')">`
            : `<img src="passport-placeholder.png" class="passport-thumb">`}
        </td>
        <td>${s.matric_number}</td>
        <td>${s.fullname}</td>
        <td>${s.email}</td>
        <td>${s.whatsapp}</td>
        <td>${s.country}</td>
        <td>${s.gender}</td>
        <td>${s.age}</td>
        <td>${s.level_arabic}</td>
        <td>${t(s.status)}</td>
        <td>
          <span class="approval-status ${s.admission_approved ? 'approved' : 'not-approved'}">
            ${s.admission_approved ? t('✅ Approved') : t('❌ Not Approved')}
          </span>
        </td>
        <td>
          ${s.admission_approved ? '' : `<button class="btn-approve" onclick="approveStudent('${s.id}')">${t("Approve")}</button>`}
        </td>
        <td>
          <button class="btn btn-small" onclick='sendSingleEmail(${JSON.stringify(s)})'>
            ${t("Send Email")}
          </button>
        </td>
        <td><button class="btn btn-edit" onclick="editStudent('${s.id}')">${t("Edit")}</button></td>
        <td>
  <button class="btn btn-delete"
          onclick="deleteStudent('${s.id}')">
    ${t("Delete")}
  </button>
  </td>
   <td>
  <button class="btn btn-danger"
          onclick="permanentDeleteStudent('${s.id}')">
    🗑️
  </button>
</td>
        <td><button class="btn btn-cert" onclick="openCertificateModal('${s.id}', '${s.matric_number}', '${s.fullname}', '${s.level_arabic}')">🎓 ${t("Issue")}</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  populateStudentSelects();
  window.reTranslate?.();
}

async function populateStudentSelects() {
  const { data } = await db
    .from("students")
    .select("fullname, matric_number")
    .order("fullname");

  ["paymentStudent", "gradeStudent"].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;

    select.innerHTML = `<option value="">${t("Select student")}</option>`;
    data?.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.matric_number;
      opt.textContent = s.fullname;
      select.appendChild(opt);
    });
  });
}

async function addStudent() {
  const btn = document.getElementById("addStudentBtn");
  setLoading(btn, true);

  try {
    const fullname = document.getElementById("studentName")?.value.trim();
    const email = document.getElementById("studentEmail")?.value.trim();
    const whatsapp = document.getElementById("studentWhatsApp")?.value.trim();
    const country = document.getElementById("studentCountry")?.value.trim();
    const gender = document.getElementById("studentGender")?.value.trim();
    const age = document.getElementById("studentAge")?.value;
    const level_arabic = document.getElementById("studentLevel")?.value.trim();
    const status = document.getElementById("studentStatus")?.value.trim();
    const admission_approved = document.getElementById("studentAdmission")?.value.trim();
    const passportFile = document.getElementById("studentPassport")?.files[0];

    if (!fullname || !email || !whatsapp || !country || !gender || !age || !level_arabic || !status || !admission_approved) {
      alert(t("Fill all required fields"));
      return;
    }

    if (!window.editingStudentId && !passportFile) {
      alert(t("Please upload a passport photo"));
      return;
    }

    let passport_url = null;
let passport_path = null;

if (passportFile) {
  const MAX_SIZE = 2 * 1024 * 1024;

  if (!passportFile.type.startsWith("image/")) {
    alert(t("Only image files are allowed"));
    return;
  }

  if (passportFile.size > MAX_SIZE) {
    alert(t("Passport must not exceed 2MB"));
    return;
  }

  const fileExt = passportFile.name.split(".").pop();
  const fileName = `${Date.now()}_${Math.floor(Math.random() * 9999)}.${fileExt}`;

  // =========================
  // 🔥 DELETE OLD FILE FIRST (EDIT ONLY)
  // =========================
  if (window.editingStudentId && window.editingStudentPassportPath) {
    await db.storage
      .from("passports")
      .remove([window.editingStudentPassportPath]);
  }

  // =========================
  // UPLOAD NEW FILE
  // =========================
  const { error: uploadError } = await db.storage
    .from("passports")
    .upload(fileName, passportFile, { cacheControl: "3600" });

  if (uploadError) throw uploadError;

  const { data: publicData } = db.storage
    .from("passports")
    .getPublicUrl(fileName);

  passport_url = publicData.publicUrl;
  passport_path = fileName;
}

    if (window.editingStudentId) {
      await db.from("students").update({
  fullname, email, whatsapp, country, gender, age,
  level_arabic, status, admission_approved,
  ...(passport_url ? { passport_url, passport_path } : {})
}).eq("id", window.editingStudentId);

      showToast(t("Student updated"));
      window.editingStudentId = null;
    } else {
      if (!passportFile) {
        alert(t("Please upload a passport photo"));
        return;
      }

      await db.from("students").insert([{
  fullname, email, whatsapp, country, gender, age,
  level_arabic, status, admission_approved,
  passport_url,
  passport_path
}]);
      showToast(t("Student added"));
    }

    closeModal("studentModal");
    loadStudents();
    loadStats();
  } catch (e) {
    console.error("Add/Edit student error:", e);
    alert(t("Failed to save student. See console."));
  } finally {
    setLoading(btn, false);
  }
}

async function editStudent(id) {
  const { data: s, error } = await db
    .from("students")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !s) return;

  document.getElementById("studentName").value = s.fullname;
  document.getElementById("studentEmail").value = s.email;
  document.getElementById("studentWhatsApp").value = s.whatsapp;
  document.getElementById("studentCountry").value = s.country;
  document.getElementById("studentGender").value = s.gender;
  document.getElementById("studentAge").value = s.age;
  document.getElementById("studentLevel").value = s.level_arabic;
  document.getElementById("studentStatus").value = s.status;
  document.getElementById("studentAdmission").value = s.admission_approved;

  // ✅ ADD THIS (important for deletion)
  window.editingStudentPassportPath = s.passport_path || null;

  window.editingStudentId = id;
  document.getElementById("studentModal").classList.add("show");
}

const passportModal = document.getElementById("passportModal");
const passportPreview = document.getElementById("passportPreview");
const closePassportModal = document.querySelector(".close-passport-modal");

function openPassportModal(url) {
  passportPreview.src = url;
  passportModal.classList.add("show");
}

if (closePassportModal) {
  closePassportModal.addEventListener("click", () => {
    passportModal.classList.remove("show");
    passportPreview.src = "";
  });
}

window.addEventListener("click", (e) => {
  if (e.target === passportModal) {
    passportModal.classList.remove("show");
    passportPreview.src = "";
  }
});

/* -------------------------------------------------------
   PAYMENTS
------------------------------------------------------- */
async function addPayment() {
  const btn = document.getElementById("addPaymentBtn");
  setLoading(btn, true);

  try {
    const matric_number = document.getElementById("paymentStudent")?.value;
    const level_arabic = document.getElementById("paymentLevel")?.value;
    const amount = Number(document.getElementById("paymentAmount")?.value || 0);
    const currency = document.getElementById("paymentCurrency")?.value;
    const month = document.getElementById("paymentMonth")?.value;
    const payment_method = document.getElementById("paymentMethod")?.value;
    const created_at = document.getElementById("paymentDate")?.value || null;
    const status = document.getElementById("paymentStatus")?.value || "Pending";

    if (!matric_number || !amount || !currency || !month || !payment_method) {
      alert(t("Fill all required fields"));
      return;
    }

    if (window.editingPaymentId) {
      await db.from("payments")
        .update({ level_arabic, amount, currency, month, payment_method, created_at, status })
        .eq("id", window.editingPaymentId);

      showToast(t("Payment updated"));
      window.editingPaymentId = null;
    } else {
      await db.from("payments").insert([{
        matric_number, level_arabic, amount, currency,
        month, payment_method, created_at, status
      }]);

      await sendNotification(
        matric_number,
        t("Payment Recorded"),
        JSON.stringify({ key: "PAYMENT_RECORDED", data: { amount: amount.toLocaleString(), month } })
      );
      showToast(t("Payment added"));
    }

    closeModal("paymentModal");
    loadPayments();
    loadStats();
  } catch (e) {
    console.error("Add/Edit payment error:", e);
    alert(t("Failed to save payment. See console."));
  } finally {
    setLoading(btn, false);
  }
}

async function loadPayments() {
  const { data } = await db
    .from("payments")
    .select(`
      id, receipt_url, matric_number, payer_name, payer_email,
      level_arabic, amount, currency, month, payment_method,
      status, created_at,
      students!payments_student_fk(fullname, level_arabic)
    `)
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  const tbody = document.querySelector("#payments-table tbody");
  if (!tbody) return;

  if (!window.editingPaymentId) {
    tbody.innerHTML = "";

    const currencies = {
      NGN: { symbol: "₦" }, USD: { symbol: "$" },
      EUR: { symbol: "€" }, GBP: { symbol: "£" }
    };

    data?.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          ${p.receipt_url
            ? `<img src="${p.receipt_url}" class="receipt-thumb" onclick="openReceiptModal('${p.receipt_url}')" alt="receipt"/>`
            : t("No receipt")}
        </td>
        <td>${p.students?.fullname || p.payer_name || t("Guest")}</td>
        <td>${p.matric_number || "—"}</td>
        <td>${p.payer_email || "—"}</td>
        <td>${p.students?.level_arabic || p.level_arabic || "—"}</td>
        <td>${currencies[p.currency]?.symbol || p.currency || ""}${Number(p.amount).toLocaleString()}</td>
        <td>${p.month}</td>
        <td>${p.payment_method}</td>
        <td>${p.created_at?.split("T")[0] || "—"}</td>
        <td>${t(p.status)}</td>
        <td>
          ${p.status === "pending"
            ? `<button class="mark-paid-btn" onclick="markPaid(this,'${p.id}','${p.matric_number}',${p.amount},'${p.month}')">✔ ${t("Mark Paid")}</button>`
            : `<span class="paid-badge">✔ ${t("Paid")}</span>`}
        </td>
        <td><button class="btn btn-edit" onclick="editPayment('${p.id}')">${t("Edit")}</button></td>
        <td>
          <div class="table-row-actions">
            <button class="btn btn-delete" onclick="deletePayment('${p.id}')">${t("Delete")}</button>
            <button class="btn btn-danger btn-icon-only" onclick="permanentDeletePayment('${p.id}')" title="${t('Permanently Delete')}">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  window.reTranslate?.();
}

async function markPaid(btn, id, matric, amount, month) {
  try {
    btn.disabled = true;
    btn.textContent = t("Processing...");

    const { error } = await db
      .from("payments")
      .update({ status: "paid" })
      .eq("id", id);

    if (error) throw error;

    await sendNotification(
      matric,
      t("Payment Confirmed"),
      JSON.stringify({ key: "PAYMENT_CONFIRMED", data: { amount: amount.toLocaleString(), month } })
    );

    await loadPayments();
    loadStats();

  } catch (e) {
    console.error("Mark paid error:", e);
    btn.disabled = false;
    btn.textContent = t("Mark Paid");
    alert(t("Failed to mark payment. Try again."));
  }
}

async function editPayment(id) {
  const { data: p } = await db
    .from("payments")
    .select("*")
    .eq("id", id)
    .single();
  if (!p) return;

  document.getElementById("paymentStudent").value = p.matric_number;
  document.getElementById("paymentLevel").value = p.level_arabic;
  document.getElementById("paymentAmount").value = p.amount;
  document.getElementById("paymentMonth").value = p.month;
  document.getElementById("paymentMethod").value = p.payment_method;
  document.getElementById("paymentStatus").value = p.status;
  document.getElementById("paymentStudent").disabled = true;
  window.editingPaymentId = id;
  document.getElementById("paymentModal").classList.add("show");

  if (p.created_at) {
    document.getElementById("paymentDate").value = p.created_at.split("T")[0];
  }
}

const receiptModal = document.getElementById("receiptModal");
const receiptPreview = document.getElementById("receiptPreview");
const closeReceiptModal = document.querySelector(".close-receipt-modal");

function openReceiptModal(url) {
  receiptPreview.src = url;
  receiptModal.classList.add("show");
}

if (closeReceiptModal) {
  closeReceiptModal.addEventListener("click", () => {
    receiptModal.classList.remove("show");
    receiptPreview.src = "";
  });
}

window.addEventListener("click", (e) => {
  if (e.target === receiptModal) {
    receiptModal.classList.remove("show");
    receiptPreview.src = "";
  }
});

/* -------------------------------------------------------
   FEES
------------------------------------------------------- */
let allFees = [];

async function loadFees() {
  const { data, error } = await db
    .from("student_fee_status")
    .select("*")
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return; }

  allFees = data;
  renderFees(data);
}

async function loadStudentDropdown() {
  const { data, error } = await db
    .from("students")
    .select("matric_number, fullname")
    .order("fullname", { ascending: true });

  if (error) { console.error(error); return; }

  const select = document.getElementById("studentSelect");
  select.innerHTML = `
    <option value="">${t("Select Student")}</option>
    ${data.map(s => `
      <option value="${s.matric_number}">
        ${s.fullname} (${s.matric_number})
      </option>
    `).join("")}
  `;
}

async function saveFee() {
  const matric = document.getElementById("studentSelect").value;
  const month = document.getElementById("month").value;
  const amount = document.getElementById("amount").value;

  if (!matric || !month || !amount) {
    alert(t("Fill all fields"));
    return;
  }

  const { error } = await db
    .from("student_fee_status")
    .upsert({ matric_number: matric, month, amount_due: amount, status: "unpaid" });

  if (error) {
    console.error(error);
    alert(t("Error saving"));
    return;
  }

  clearForm();
  loadFees();
}

function clearForm() {
  document.getElementById("studentSelect").value = "";
  document.getElementById("month").value = "";
  document.getElementById("amount").value = "";
}

async function toggleStatus(matric, month, currentStatus) {
  const newStatus = currentStatus === "paid" ? "unpaid" : "paid";
  await db
    .from("student_fee_status")
    .update({ status: newStatus })
    .eq("matric_number", matric)
    .eq("month", month);
  loadFees();
}

// NOTE: Delete / Permanent Delete for fee records is now handled by the
// generic softDelete()/permanentDelete() helpers — see DELETE ACTIONS
// section (window.deleteFee / window.permanentDeleteFee).

function filterFees() {
  const query = document.getElementById("search").value.toLowerCase();
  const filtered = allFees.filter(row =>
    row.matric_number.toLowerCase().includes(query)
  );
  renderFees(filtered);
}

function renderFees(data) {
  const container = document.getElementById("feeTable");

  if (!data.length) {
    container.innerHTML = `<p>${t("No records found")}</p>`;
    return;
  }

  container.innerHTML = `
    <table>
      <tr>
        <th>${t("Matric Number")}</th>
        <th>${t("Month")}</th>
        <th>${t("Amount")}</th>
        <th>${t("Status")}</th>
        <th>${t("Actions")}</th>
      </tr>
      ${data.map(row => `
        <tr>
          <td>${row.matric_number}</td>
          <td>${row.month}</td>
          <td>₦${Number(row.amount_due).toLocaleString()}</td>
          <td class="status-${row.status}">
            ${row.status === "paid" ? t("✅ Paid") : t("❌ Unpaid")}
          </td>
          <td>
            <button class="action-btn toggle1-btn"
              onclick="toggleStatus('${row.matric_number}', '${row.month}', '${row.status}')">
              ${t("Toggle")}
            </button>
            <button class="action-btn delete-btn"
              onclick="deleteFee('${row.matric_number}', '${row.month}')">
              ${t("Delete")}
            </button>
            <button class="action-btn permadelete-btn"
              onclick="permanentDeleteFee('${row.matric_number}', '${row.month}')" title="${t('Permanently Delete')}">
              🗑️
            </button>
          </td>
        </tr>
      `).join("")}
    </table>
  `;
}

/* -------------------------------------------------------
   GRADES
------------------------------------------------------- */
async function addGrade() {
  try {
    const matric_number = document.getElementById("gradeStudent")?.value;
    const course = document.getElementById("gradeCourse")?.value;
    const semester = document.getElementById("gradeSemester")?.selectedOptions[0].textContent;
    const level_arabic = document.getElementById("gradeLevel")?.value;
    const a = Number(document.getElementById("gradeAssessment")?.value || 0);
    const b = Number(document.getElementById("gradeExams")?.value || 0);
    const total_score = a + b;
    const status = document.getElementById("gradeStatus")?.value;
    const remark = document.getElementById("gradeRemark")?.value;

    const btn = document.getElementById("addGradeBtn");
    setLoading(btn, true);

    if (!matric_number || !course) {
      alert(t("Fill all required fields"));
      return;
    }

    const gradeData = {
      matric_number, level_arabic, course, semester,
      assessment_score: a, exam_score: b, total_score, status, remark
    };

    if (window.editingGradeId) {
      const { error } = await db.from("grades").update(gradeData).eq("id", window.editingGradeId);
      if (error) throw error;

      showToast(t("Grade updated"));
      window.editingGradeId = null;
    } else {
      const { error } = await db.from("grades").insert([gradeData]);
      if (error) throw error;

      await sendNotification(
        matric_number,
        t("New Grade Posted"),
        JSON.stringify({ key: "GRADE_RELEASED", data: { course } })
      );
      showToast(t("Grade added"));
    }

    closeModal("gradeModal");
    await loadGrades();
  } catch (e) {
    console.error("Add/Edit grade error:", e);
    alert(t("Failed to save grade. See console."));
  } finally {
    setLoading(document.getElementById("addGradeBtn"), false);
  }
}

async function loadGrades() {
  try {
    const students = await loadStudentsCache();

    const { data: grades, error } = await db
      .from("grades")
      .select("id, matric_number, course, semester, assessment_score, exam_score, total_score, status, remark, released, created_at")
      .eq("deleted", false)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const tbody = document.querySelector("#grades-table tbody");
    if (!tbody) return;

    if (!window.editingGradeId) {
      tbody.innerHTML = "";

      grades.forEach(g => {
        const student = students.find(s => s.matric_number === g.matric_number) || {};
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${student.fullname || ""}</td>
          <td>${g.matric_number}</td>
          <td>${student.level_arabic || ""}</td>
          <td>${g.course}</td>
          <td>${g.semester}</td>
          <td>${g.assessment_score}</td>
          <td>${g.exam_score}</td>
          <td>${g.total_score}</td>
          <td>${t(g.status)}</td>
          <td>${t(g.remark)}</td>
          <td>
            <label class="switch">
              <input type="checkbox" ${g.released ? "checked" : ""} onchange="toggleReleased('${g.id}', this.checked)">
              <span class="slider round"></span>
            </label>
          </td>
          <td><button class="btn btn-edit" onclick="editGrade('${g.id}')">${t("Edit")}</button></td>
          <td>
            <div class="table-row-actions">
              <button class="btn btn-delete" onclick="deleteGrade('${g.id}')">${t("Delete")}</button>
              <button class="btn btn-danger btn-icon-only" onclick="permanentDeleteGrade('${g.id}')" title="${t('Permanently Delete')}">🗑️</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
    window.reTranslate?.();
  } catch (e) {
    console.error("Failed to load grades:", e);
  }
}

function enableGradeAutoTotal() {
  const assessment = document.getElementById("gradeAssessment");
  const exams = document.getElementById("gradeExams");
  const total = document.getElementById("gradeTotal");
  if (!assessment || !exams || !total) return;

  function calculate() {
    total.value = (Number(assessment.value || 0) + Number(exams.value || 0));
  }
  assessment.addEventListener("input", calculate);
  exams.addEventListener("input", calculate);
}

async function editGrade(id) {
  try {
    const { data: g, error } = await db.from("grades").select("*").eq("id", id).single();
    if (error || !g) return;

    window.editingGradeId = id;
    document.getElementById("gradeStudent").value = g.matric_number;
    document.getElementById("gradeLevel").value = g.level_arabic;
    document.getElementById("gradeCourse").value = g.course;
    document.getElementById("gradeSemester").value = g.semester;
    document.getElementById("gradeAssessment").value = g.assessment_score;
    document.getElementById("gradeExams").value = g.exam_score;
    document.getElementById("gradeTotal").value = g.total_score;
    document.getElementById("gradeStatus").value = g.status;
    document.getElementById("gradeRemark").value = g.remark;
    document.getElementById("gradeModal").classList.add("show");
  } catch (e) {
    console.error("Edit grade error:", e);
  }
}

/* -------------------------------------------------------
   SCHEDULE
------------------------------------------------------- */
async function addSchedule() {
  const btn = document.getElementById("addScheduleBtn");
  setLoading(btn, true);

  try {
    const level_arabic = document.getElementById("classLevel").value;
    const course = document.getElementById("classCourse").value;
    const instructor = document.getElementById("Instructor").value;
    const class_date = document.getElementById("classDate").value;
    const class_time = document.getElementById("classTime").value;
    const meeting_link = document.getElementById("classLink").value;
    const status = document.getElementById("classStatus").value;

    if (!level_arabic || !course || !instructor || !class_date || !class_time || !meeting_link || !status) {
      alert(t("Fill all fields"));
      return;
    }

    if (window.editingScheduleId) {
      await db.from("schedule")
        .update({ level_arabic, course, instructor, class_date, class_time, meeting_link, status })
        .eq("id", window.editingScheduleId);

      showToast(t("Schedule updated"));
      window.editingScheduleId = null;
    } else {
      await db.from("schedule").insert([{
        level_arabic, course, instructor, class_date, class_time, meeting_link, status
      }]);

      const { data: students } = await db.from("students").select("matric_number");
      students?.forEach(s => {
        sendNotification(
          s.matric_number,
          t("New Class Scheduled"),
          JSON.stringify({ key: "CLASS_SCHEDULED", data: { course, date: class_date, time: class_time } })
        );
      });

      showToast(t("Schedule added"));
    }

    closeModal("scheduleModal");
    loadSchedule();
  } catch (e) {
    console.error("Add/Edit schedule error:", e);
    alert(t("Failed to save schedule. See console."));
  } finally {
    setLoading(btn, false);
  }
}

async function loadSchedule() {
  try {
    const { data } = await db.from("schedule").select("*").eq("deleted", false).order("class_date");
    const tbody = document.querySelector("#schedule-table tbody");
    if (!tbody) return;

    if (!window.editingScheduleId) {
      tbody.innerHTML = "";
      data?.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${c.level_arabic}</td>
          <td>${c.course}</td>
          <td>${c.instructor}</td>
          <td>${c.class_date}</td>
          <td>${c.class_time}</td>
          <td><a href="${c.meeting_link}" target="_blank" class="join-btn">${t("Join")}</a></td>
          <td>${t(c.status)}</td>
          <td><button class="btn btn-edit" onclick="editSchedule('${c.id}')">${t("Edit")}</button></td>
          <td>
            <div class="table-row-actions">
              <button class="btn btn-delete" onclick="deleteSchedule('${c.id}')">${t("Delete")}</button>
              <button class="btn btn-danger btn-icon-only" onclick="permanentDeleteSchedule('${c.id}')" title="${t('Permanently Delete')}">🗑️</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
    window.reTranslate?.();
  } catch (e) {
    console.error("Load schedule error:", e);
  }
}

async function editSchedule(id) {
  const { data: c, error } = await db.from("schedule").select("*").eq("id", id).single();
  if (error || !c) return;

  document.getElementById("classLevel").value = c.level_arabic;
  document.getElementById("classCourse").value = c.course;
  document.getElementById("Instructor").value = c.instructor;
  document.getElementById("classDate").value = c.class_date;
  document.getElementById("classTime").value = c.class_time;
  document.getElementById("classLink").value = c.meeting_link;
  document.getElementById("classStatus").value = c.status;

  window.editingScheduleId = id;
  document.getElementById("scheduleModal").classList.add("show");
}

window.editingAssessmentId = null;

/* -------------------------------------------------------
   ASSESSMENTS
------------------------------------------------------- */
async function addAssessment() {
  const btn = document.getElementById("addAssessmentBtn");
  setLoading(btn, true);

  try {
    const description = document.getElementById("assessmentDescription").value;
    const title = document.getElementById("assessmentTitle").value;
    const level_arabic = document.getElementById("assessmentLevel").value;
    const course = document.getElementById("assessmentCourse").value;
    const semester = document.getElementById("assessmentSemester").value;
    const type = document.getElementById("assessmentType").value;
    const max_score = document.getElementById("assessmentScore").value;
    const duration_minutes = document.getElementById("assessmentDuration").value;
    const start_time = document.getElementById("assessmentStart").value;
    const end_time = document.getElementById("assessmentEnd").value;

    if (isNaN(new Date(start_time))) {
      alert(t("Invalid start date"));
      return;
    }
    if (isNaN(new Date(end_time))) {
      alert(t("Invalid end date"));
      return;
    }

    const startUTC = new Date(start_time).toISOString();
    const endUTC = new Date(end_time).toISOString();
    const status = document.getElementById("assessmentStatus").value;

    if (!description || !title || !level_arabic || !course || !semester || !type || !max_score || !duration_minutes || !start_time || !end_time || !status) {
      alert(t("Fill all fields"));
      setLoading(btn, false);
      return;
    }

    if (window.editingAssessmentId) {
      const { error } = await db.from("assessments").update({
        description, title, level_arabic, course, semester, type,
        max_score, duration_minutes: parseInt(duration_minutes),
        start_time: startUTC, end_time: endUTC,
        status, is_active: status === "active"
      }).eq("id", window.editingAssessmentId);

      if (error) throw error;
      showToast(t("Assessment updated"));
      window.editingAssessmentId = null;
    } else {
      const { error } = await db.from("assessments").insert([{
        description, title, level_arabic, course, semester, type,
        max_score, duration_minutes: parseInt(duration_minutes),
        start_time: startUTC, end_time: endUTC,
        status, is_active: status === "active"
      }]);

      if (error) { console.error("Insert error:", error); throw error; }
      showToast(t("Assessment added"));
    }

    closeModal("assessmentModal");
    loadAssessments();
  } catch (e) {
    console.error("Add/Edit assessment error:", e);
    alert(t("Failed to save assessment"));
  } finally {
    setLoading(btn, false);
  }
}

async function editAssessment(id) {
  const { data: a, error } = await db.from("assessments").select("*").eq("id", id).single();
  if (error || !a) return;

  document.getElementById("assessmentDescription").value = a.description;
  document.getElementById("assessmentTitle").value = a.title;
  document.getElementById("assessmentLevel").value = a.level_arabic;
  document.getElementById("assessmentCourse").value = a.course;
  document.getElementById("assessmentSemester").value = a.semester;
  document.getElementById("assessmentType").value = a.type;
  document.getElementById("assessmentScore").value = a.max_score;
  document.getElementById("assessmentDuration").value = a.duration_minutes;
  document.getElementById("assessmentStart").value = a.start_time ? formatForInput(a.start_time) : "";
  document.getElementById("assessmentEnd").value = a.end_time ? formatForInput(a.end_time) : "";
  document.getElementById("assessmentStatus").value = a.status;
  window.editingAssessmentId = id;
  document.getElementById("assessmentModal").classList.add("show");
}

async function loadAssessments() {
  try {
    const { data } = await db.from("assessments").select("*").eq("deleted", false).order("start_time");
    const tbody = document.querySelector("#assessments-table tbody");
    if (!tbody) return;

    if (!window.editingAssessmentId) {
      tbody.innerHTML = "";
      data?.forEach(a => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${a.description}</td>
          <td>${a.title}</td>
          <td>${a.level_arabic}</td>
          <td>${a.course}</td>
          <td>${a.semester}</td>
          <td>${t(a.type)}</td>
          <td>${a.max_score}</td>
          <td>${a.duration_minutes}</td>
          <td>${formatDate(a.start_time)}</td>
          <td>${formatDate(a.end_time)}</td>
          <td>${t(a.status)}</td>
          <td>
            <label class="switch">
              <input type="checkbox" ${a.is_active ? "checked" : ""} onchange="toggleAssessment('${a.id}', this.checked)">
              <span class="slider"></span>
            </label>
          </td>
          <td>
            <div class="table-row-actions">
              <button class="btn btn-edit" onclick="editAssessment('${a.id}')">${t("Edit")}</button>
              <button class="btn btn-delete" onclick="deleteAssessment('${a.id}')">${t("Delete")}</button>
              <button class="btn btn-danger btn-icon-only" onclick="permanentDeleteAssessment('${a.id}')" title="${t('Permanently Delete')}">🗑️</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (e) {
    console.error("Load assessments error:", e);
  }
}

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString();
}

function formatForInput(dateString) {
  const d = new Date(dateString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/* -------------------------------------------------------
   COURSES
------------------------------------------------------- */
async function addCourse() {
  const name = document.getElementById("courseName").value.trim();
  const level = document.getElementById("courseLevel").value;

if (!level) {
  return alert(t("Please select a level"));
}
  const instructorSelect = document.getElementById("courseInstructor");

  const instructor_id = instructorSelect.value;
  const instructor_name = instructorSelect.options[instructorSelect.selectedIndex]?.text;

  if (!name) {
    alert(t("Course name is required"));
    return;
  }

  if (!instructor_id) {
    alert(t("Please select an instructor"));
    return;
  }

  const payload = {
    course_name: name,
    level,
    instructor_id,
    instructor: instructor_name // 👈 store name too
  };

  if (window.editingCourseId) {
    const { error } = await db
      .from("courses")
      .update(payload)
      .eq("id", window.editingCourseId);

    if (error) {
      console.error(error);
      alert(t("Error updating course"));
      return;
    }

    showToast(t("Course updated ✅"));
    window.editingCourseId = null;

  } else {
    const { error } = await db
      .from("courses")
      .insert([payload]);

    if (error) {
      console.error(error);
      alert(t("Error adding course"));
      return;
    }

    showToast(t("Course added ✅"));
  }

  document.getElementById("courseName").value = "";
  document.getElementById("courseLevel").value = "";
  document.getElementById("courseInstructor").value = "";

  loadCoursesAdmin();
}

async function loadCoursesAdmin() {
  const container = document.getElementById("adminCoursesList");

  const { data, error } = await db
    .from("courses")
    .select("*")
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return; }

  if (!data.length) {
    container.innerHTML = `<p>${t("No courses yet")}</p>`;
    return;
  }

  container.innerHTML = data.map(course => `
    <div class="course-item">
      <div>
        <strong>${course.course_name}</strong>
        <span class="course-meta">
          ${course.level ? `${t("Level:")}: ${course.level}` : ""}
          ${course.level && course.instructor ? " · " : ""}
          ${course.instructor ? `${t("Instructor:")}: ${course.instructor}` : ""}
        </span>
      </div>
      <div class="course-item-actions">
        <button class="btn btn-edit"
          onclick="editCourse('${course.id}', '${course.course_name.replace(/'/g, "\\'")}', '${(course.level || "").replace(/'/g, "\\'")}', '${(course.instructor || "").replace(/'/g, "\\'")}')">
          ${t("Edit")}
        </button>
        <button class="btn btn-delete" onclick="deleteCourse('${course.id}')">
          ${t("Delete")}
        </button>
        <button class="btn btn-danger btn-icon-only" onclick="permanentDeleteCourse('${course.id}')" title="${t('Permanently Delete')}">
          🗑️
        </button>
      </div>
    </div>
  `).join("");
}

/* -------------------------------------------------------
   PASSWORDS
------------------------------------------------------- */
async function changeMyPassword() {
  const newPassword = document.getElementById("newPassword").value;

  if (!newPassword || newPassword.length < 6) {
    alert(t("Password must be at least 6 characters"));
    return;
  }

  try {
    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) throw error;

    alert(t("Password updated successfully 🔐"));
    document.getElementById("oldPassword").value = "";
    document.getElementById("newPassword").value = "";
  } catch (err) {
    console.error(err);
    alert(t("Failed to update password"));
  }
}

async function resetStudentPassword() {
  const matric = document.getElementById("passwordStudentSelect").value;
  const newPassword = document.getElementById("newStudentPassword").value;

  if (!matric || !newPassword) {
    alert(t("Select student and enter password"));
    return;
  }

  const btn = event.target;
  setLoading(btn, true);

  try {
    const { error } = await db
      .from("students")
      .update({ password: newPassword })
      .eq("matric_number", matric);

    if (error) throw error;
    alert(t("Password updated successfully 🔐"));

    await sendNotification(
      matric,
      t("Password Updated"),
      t("Your account password has been updated by the admin. Please log in with your new password.")
    );

    showToast(t("Password updated successfully"));
    document.getElementById("newStudentPassword").value = "";
  } catch (e) {
    console.error(e);
    alert(t("Failed to update password"));
  } finally {
    setLoading(btn, false);
  }
}

async function loadPasswordStudentDropdown() {
  const { data } = await db.from("students").select("matric_number, fullname");
  const select = document.getElementById("passwordStudentSelect");
  if (!select) return;

  select.innerHTML = `<option value="">${t("Select student")}</option>` +
    data.map(s => `<option value="${s.matric_number}">${s.fullname} (${s.matric_number})</option>`).join("");
}

/* -------------------------------------------------------
   DELETE ACTIONS
   - softDelete()    -> reversible. Sets deleted = true, hides the row,
                        and arms the navbar Undo button for 10s.
   - permanentDelete()-> irreversible. Actually removes the row from
                        Supabase so it stops piling up unwanted data.
   Both accept either a simple `id`, or a `match` object for tables
   that use a composite key (e.g. student_fee_status).
------------------------------------------------------- */
async function softDelete({ table, id, match, reloadFn, label, extraReload }) {
  if (!confirm(`${t("Delete this")} ${label}? ${t("You can undo this.")}`)) return;

  const lookup = match || { id };
  let query = db.from(table).update({ deleted: true }).select();
  Object.entries(lookup).forEach(([col, val]) => { query = query.eq(col, val); });

  const { data, error } = await query;
  if (error) {
    console.error(`Soft delete (${table}) error:`, error);
    alert(t("Failed to delete. See console."));
    return;
  }

  if (!data || data.length === 0) {
    alert(t("Nothing was deleted — check your Supabase RLS UPDATE policy for this table."));
    return;
  }

  window.lastDeleted = { table, match: lookup, reloadFn, extraReload };

  showToast(`${label} ${t("deleted. Undo?")}`);
  reloadFn();
  if (typeof extraReload === "function") extraReload();

  setTimeout(() => { window.lastDeleted = null; }, 10000);
}

window.deleteStudent = id =>
  softDelete({ table: "students", id, reloadFn: loadStudents, label: t("student"), extraReload: loadDeletedStudents });

window.deletePayment = id =>
  softDelete({ table: "payments", id, reloadFn: loadPayments, label: t("payment") });

window.deleteGrade = id =>
  softDelete({ table: "grades", id, reloadFn: loadGrades, label: t("grade") });

window.deleteSchedule = id =>
  softDelete({ table: "schedule", id, reloadFn: loadSchedule, label: t("class") });

window.deleteAssessment = id =>
  softDelete({ table: "assessments", id, reloadFn: loadAssessments, label: t("assessment") });

window.deleteCourse = id =>
  softDelete({ table: "courses", id, reloadFn: loadCoursesAdmin, label: t("course") });

window.deleteAttendanceSession = id =>
  softDelete({ table: "attendance_sessions", id, reloadFn: loadAttendanceSessions, label: t("attendance session") });

window.deleteFee = (matric, month) =>
  softDelete({
    table: "student_fee_status",
    match: { matric_number: matric, month },
    reloadFn: loadFees,
    label: t("fee record")
  });

/* -------------------------------------------------------
   PERMANENT DELETE (generic) — actually removes the row.
------------------------------------------------------- */
async function permanentDelete({ table, id, match, reloadFn, label, beforeDelete }) {
  if (!confirm(`${t("Permanently delete this")} ${label}? ${t("This cannot be undone.")}`)) return;

  try {
    if (typeof beforeDelete === "function") {
      await beforeDelete();
    }

    const lookup = match || { id };
    let query = db.from(table).delete().select();
    Object.entries(lookup).forEach(([col, val]) => { query = query.eq(col, val); });

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      // No error, but nothing was actually deleted — almost always an RLS
      // policy silently blocking the row (Supabase doesn't error on this).
      alert(t("Nothing was deleted — check your Supabase RLS DELETE policy for this table."));
      return;
    }

    showToast(`${label} ${t("permanently deleted")} 🗑️`);
    reloadFn();
  } catch (e) {
    console.error(`Permanent delete (${table}) error:`, e);
    alert(t("Failed to permanently delete. See console."));
  }
}

window.permanentDeletePayment = id =>
  permanentDelete({ table: "payments", id, reloadFn: loadPayments, label: t("payment") });

window.permanentDeleteGrade = id =>
  permanentDelete({ table: "grades", id, reloadFn: loadGrades, label: t("grade") });

window.permanentDeleteSchedule = id =>
  permanentDelete({ table: "schedule", id, reloadFn: loadSchedule, label: t("class") });

window.permanentDeleteAssessment = id =>
  permanentDelete({ table: "assessments", id, reloadFn: loadAssessments, label: t("assessment") });

window.permanentDeleteCourse = id =>
  permanentDelete({ table: "courses", id, reloadFn: loadCoursesAdmin, label: t("course") });

window.permanentDeleteAttendanceSession = id =>
  permanentDelete({
    table: "attendance_sessions",
    id,
    reloadFn: loadAttendanceSessions,
    label: t("attendance session"),
    // Clean up related records first so they don't become orphaned data
    beforeDelete: async () => { await db.from("attendance_records").delete().eq("session_id", id); }
  });

window.permanentDeleteFee = (matric, month) =>
  permanentDelete({
    table: "student_fee_status",
    match: { matric_number: matric, month },
    reloadFn: loadFees,
    label: t("fee record")
  });

/* -------------------------------------------------------
   RESTORE (generic) — used by the consolidated Trash Bin tab.
   Sets deleted = false and refreshes both the trash view and
   that table's main "active" list, if it's currently loaded.
------------------------------------------------------- */
const TRASH_SYNC_RELOAD = {
  students: () => typeof loadStudents === "function" && loadStudents(),
  payments: () => typeof loadPayments === "function" && loadPayments(),
  grades: () => typeof loadGrades === "function" && loadGrades(),
  schedule: () => typeof loadSchedule === "function" && loadSchedule(),
  assessments: () => typeof loadAssessments === "function" && loadAssessments(),
  courses: () => typeof loadCoursesAdmin === "function" && loadCoursesAdmin(),
  attendance_sessions: () => typeof loadAttendanceSessions === "function" && loadAttendanceSessions(),
  student_fee_status: () => typeof loadFees === "function" && loadFees(),
  certificates: () => typeof loadCertificatesRegistryData === "function" && loadCertificatesRegistryData()
};

async function restoreDeleted({ table, match, reloadFn }) {
  let query = db.from(table).update({ deleted: false }).select();
  Object.entries(match).forEach(([col, val]) => { query = query.eq(col, val); });

  const { data, error } = await query;
  if (error) {
    console.error(`Restore (${table}) error:`, error);
    alert(t("Failed to restore. See console."));
    return;
  }

  if (!data || data.length === 0) {
    alert(t("Nothing was restored — check your Supabase RLS UPDATE policy for this table."));
    return;
  }

  showToast(t("Item restored ✅"));
  if (typeof reloadFn === "function") reloadFn();
  if (typeof TRASH_SYNC_RELOAD[table] === "function") TRASH_SYNC_RELOAD[table]();
}

/* -------------------------------------------------------
   UNDO
------------------------------------------------------- */
async function undoDelete() {
  if (!window.lastDeleted) {
    alert(t("Nothing to undo"));
    return;
  }

  const { table, match, reloadFn, extraReload } = window.lastDeleted;
  let query = db.from(table).update({ deleted: false }).select();
  Object.entries(match).forEach(([col, val]) => { query = query.eq(col, val); });
  const { data, error } = await query;

  window.lastDeleted = null;

  if (error || !data || data.length === 0) {
    console.error(`Undo (${table}) error:`, error);
    alert(t("Failed to undo. See console."));
    return;
  }

  reloadFn();
  if (typeof extraReload === "function") extraReload();
  showToast(t("Undo successful"));
}

async function permanentDeleteStudent(id) {

  if (!confirm(t("This will permanently delete the student and ALL related data. Continue?"))) {
    return;
  }

  try {

    /* 1. Get student (matric + passport) */
    const { data: student, error: fetchError } = await db
      .from("students")
      .select("matric_number, passport_path")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    const matric = student?.matric_number;

    /* 2. Delete related tables first */
    if (matric) {

      await db.from("notifications").delete().eq("matric_number", matric);
      await db.from("grades").delete().eq("matric_number", matric);
      await db.from("payments").delete().eq("matric_number", matric);
      await db.from("student_fee_status").delete().eq("matric_number", matric);
      await db.from("certificates").delete().eq("matric_number", matric);
      await db.from("course_registrations").delete().eq("matric_number", matric);
      await db.from("attendance_records").delete().eq("student_matric", id);

    }

    /* 3. Delete passport from storage */
    if (student?.passport_path) {

      const { error: storageError } = await db.storage
        .from("passports")
        .remove([student.passport_path]);

      if (storageError) {
        console.error("Passport delete failed:", storageError);
      }
    }

    /* 4. Delete student */
    const { error: deleteError } = await db
      .from("students")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    showToast(t("Student permanently deleted"));

    loadStudents();
    loadStats();

  } catch (err) {

    console.error("Permanent delete error:", err);
    alert(t("Failed to permanently delete student"));

  }
}

window.permanentDeleteStudent = permanentDeleteStudent;


// NOTE: the dashboard's real "Deleted" trash panel lives in #trashTabPanelBody
// (see loadDeletedTabPanelContent below) — #students-trash-table doesn't exist
// in the HTML. This wrapper just keeps the function name stable for the
// existing call sites (softDelete's extraReload, undoDelete, boot sequence)
// while actually refreshing the real, visible trash panel.
async function loadDeletedStudents() {
  if (typeof loadDeletedTabPanelContent === "function") {
    await loadDeletedTabPanelContent();
  }
}

async function restoreStudent(id) {
  const { error } = await db
    .from("students")
    .update({ deleted: false })
    .eq("id", id);

  if (error) {
    console.error(error);
    alert(t("Restore failed"));
    return;
  }

  showToast(t("Student restored successfully"));

  loadStudents();          // active list
  loadDeletedStudents();   // trash list
}

window.restoreStudent = restoreStudent;

async function restoreAllStudents() {
  const { error } = await db
    .from("students")
    .update({ deleted: false })
    .eq("deleted", true);

  if (error) return alert("Failed");

  loadStudents();
  loadDeletedStudents();
  showToast("All students restored");
}

/* -------------------------------------------------------
   RELEASED / TOGGLE
------------------------------------------------------- */
async function toggleReleased(gradeId, isReleased) {
  try {
    await db.from("grades").update({ released: isReleased }).eq("id", gradeId);
    showToast(isReleased ? t("Grade released") : t("Grade hidden"));
  } catch (e) {
    console.error("Error toggling released:", e);
  }
}

async function toggleAssessment(id, isActive) {
  const { error } = await db
    .from("assessments")
    .update({ is_active: isActive, status: isActive ? "active" : "inactive" })
    .eq("id", id);

  if (error) {
    console.error("Error updating assessment:", error);
    alert(t("Failed to update assessment"));
    return;
  }
  loadAssessments();
}

/* -------------------------------------------------------
   APPROVE STUDENT
------------------------------------------------------- */
async function approveStudent(studentId) {
  const { error } = await db
    .from("students")
    .update({ admission_approved: true })
    .eq("id", studentId);

  if (error) {
    alert(t("Error approving student:") + " " + error.message);
  } else {
    alert(t("Student admission approved!"));
    loadStudents();
  }
}

/* -------------------------------------------------------
   SEARCH & SORT
------------------------------------------------------- */
function enableTableSearch(inputId, tableId) {
  const input = document.getElementById(inputId);
  const table = document.getElementById(tableId);
  if (!input || !table) return;

  input.addEventListener("keyup", () => {
    const filter = input.value.toLowerCase();
    table.querySelectorAll("tbody tr").forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(filter) ? "" : "none";
    });
  });
}

function enableTableSorting(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  table.querySelectorAll("th").forEach((th, idx) => {
    let asc = true;
    th.addEventListener("click", () => {
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      rows.sort((a, b) => {
        const A = a.children[idx].innerText.toLowerCase();
        const B = b.children[idx].innerText.toLowerCase();
        return asc ? A.localeCompare(B) : B.localeCompare(A);
      });
      asc = !asc;
      rows.forEach(r => table.querySelector("tbody").appendChild(r));
    });
  });
}

/* -------------------------------------------------------
   WELCOME EMAILS
------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const db = window.supabaseClient;
  if (!db) { console.error("Supabase client not found"); return; }

  const btn = document.getElementById("sendWelcomeEmails");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const originalText = btn.innerText;
    try {
      btn.disabled = true;
      btn.innerText = t("Sending... ⏳");

      const { data: students, error } = await db
        .from("students")
        .select("id, email, matric_number, fullname")
        .or("welcome_email_sent.is.false,welcome_email_sent.is.null");

      if (error) {
        console.error(error);
        alert(t("Failed to fetch students"));
        return;
      }

      if (!students.length) {
        alert(t("No pending welcome emails 🙂"));
        return;
      }

      let sent = 0;
      let failed = 0;
      updateEmailProgress(sent, failed, students.length);

      for (const student of students) {
        try {
          const response = await fetch(
            "https://cjrpjekmqrckozrbtwps.supabase.co/functions/v1/send-welcome-email",
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "apikey": SUPABASE_PUBLISHABLE_KEY },
              body: JSON.stringify({
                email: student.email,
                fullName: student.fullname,
                matricNumber: student.matric_number
              })
            }
          );

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || errData.message || "Email failed");
          }

          await db.from("students").update({ welcome_email_sent: true }).eq("id", student.id);
          sent++;
        } catch (err) {
          console.error("Failed:", student.email, err);
          failed++;
        }
        updateEmailProgress(sent, failed, students.length);
      }

      if (failed === 0) {
        alert(t("All welcome emails sent successfully 🎉"));
      } else if (sent === 0) {
        alert(t("All emails failed to send 😢"));
      } else {
        alert(`${t("Completed 🙂")}\n${t("Sent")}: ${sent}\n${t("Failed")}: ${failed}`);
      }

    } catch (err) {
      console.error(err);
      alert(t("Unexpected error occurred"));
    } finally {
      btn.disabled = false;
      btn.innerText = originalText;
    }
  });
});

async function sendSingleEmail(student) {
  try {
    const response = await fetch(
      "https://cjrpjekmqrckozrbtwps.supabase.co/functions/v1/send-welcome-email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          email: student.email,
          fullName: student.fullname,
          matricNumber: student.matric_number
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Email failed");
    }

    await db.from("students").update({ welcome_email_sent: true }).eq("id", student.id);
    alert(`${t("Email sent to")} ${student.fullname}`);
  } catch (err) {
    console.error(err);
    alert(`${t("Failed to send email to")} ${student.fullname}`);
  }
}

/* -------------------------------------------------------
   LOGOUT
------------------------------------------------------- */
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await db.auth.signOut();
    sessionStorage.clear();
    localStorage.removeItem("rememberedEmail");
    localStorage.removeItem("loginTime");
    window.location.href = "login.html";
  });
}

/* -------------------------------------------------------
   EMAIL PROGRESS
------------------------------------------------------- */
function updateEmailProgress(sent, failed, total) {
  let box = document.getElementById("emailProgressBox");

  if (!box) {
    box = document.createElement("div");
    box.id = "emailProgressBox";
    box.style.cssText = `
      margin-top: 40px; padding: 12px; border: 1px solid #ddd;
      border-radius: 8px; background: #f9f9f9; color: #161616;
      position: fixed; top: 80px; right: 20px; width: 280px; z-index: 99999;
    `;
    document.getElementById("sendWelcomeEmails").after(box);
  }

  box.innerHTML = `
    <button id="closeEmailProgress" style="
      position: absolute; top: 6px; right: 8px; border: none;
      background: #e74c3c; color: white; width: 28px; height: 28px;
      border-radius: 50%; font-size: 16px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;">
      ×
    </button>
    <strong>${t("Email Progress")}</strong><br><br>
    ✅ ${t("Sent")}: ${sent}<br>
    ❌ ${t("Failed")}: ${failed}<br>
    📊 ${t("Total")}: ${total}
  `;

  const closeBtn = document.getElementById("closeEmailProgress");
  if (closeBtn) {
    closeBtn.onclick = () => box.remove();
    closeBtn.onmouseover = () => { closeBtn.style.background = "#c0392b"; };
    closeBtn.onmouseout = () => { closeBtn.style.background = "#e74c3c"; };
  }
}

window.addEventListener("load", () => {
  updateUnreadCounter();
  setInterval(updateUnreadCounter, 10000);
});

/* -------------------------------------------------------
   CERTIFICATES
------------------------------------------------------- */
async function openCertificateModal(studentId, matric, fullname, level) {
  document.getElementById("certStudentName").value = fullname;
  document.getElementById("certMatric").value = matric;
  document.getElementById("certLevel").value = level;

  window.certStudentData = { studentId, matric, fullname, level };

  const courseSelect = document.getElementById("certCourse");
  courseSelect.innerHTML = `<option value="">${t("Loading courses...")}</option>`;

  const { data: existing } = await db
    .from("certificates")
    .select("id, course_name, grade_note, revoked")
    .eq("matric_number", matric)
    .eq("deleted", false);

  const { data: registrations, error } = await db
    .from("course_registrations")
    .select("course_id")
    .eq("matric_number", matric);

  if (error || !registrations || registrations.length === 0) {
    courseSelect.innerHTML = `<option value="">${t("No courses found")}</option>`;
    renderExistingCerts(existing || []);
    openModal("certificateModal");
    return;
  }

  const courseIds = registrations.map(r => r.course_id);

  const { data: courses, error: coursesError } = await db
    .from("courses")
    .select("id, course_name")
    .in("id", courseIds);

  if (coursesError || !courses) {
    courseSelect.innerHTML = `<option value="">${t("Failed to load courses.")}</option>`;
    renderExistingCerts(existing || []);
    openModal("certificateModal");
    return;
  }

  courseSelect.innerHTML = `<option value="">${t("Select Course")}</option>` +
    courses.map(c => `<option value="${c.course_name}">${c.course_name}</option>`).join("");

  renderExistingCerts(existing || []);
  openModal("certificateModal");
}

function renderExistingCerts(certs) {
  const old = document.getElementById("existingCertsList");
  if (old) old.remove();
  if (!certs || certs.length === 0) return;

  const container = document.getElementById("certHistoryScroll");
  if (!container) return;
  const div = document.createElement("div");
  div.id = "existingCertsList";

  div.innerHTML = `
    <h3 class="cert-history-title">${t("Issued Certificates")}</h3>
    <div class="table-container cert-history-table-wrap">
      <table class="cert-history-table">
        <thead>
          <tr>
            <th>${t("Course")}</th>
            <th>${t("Grade Note")}</th>
            <th>${t("Status")}</th>
            <th>${t("Actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${certs.map(c => `
            <tr>
              <td>${c.course_name}</td>
              <td class="cert-grade-note">${c.grade_note || "—"}</td>
              <td>
                ${c.revoked
                  ? `<span class="badge badge-danger">${t("Revoked")}</span>`
                  : `<span class="badge badge-success">${t("Active")}</span>`
                }
              </td>
              <td>
                <div class="table-row-actions">
                  ${c.revoked
                    ? `<button class="btn btn-save btn-small" onclick="restoreCertificate('${c.id}')">${t("Restore")}</button>`
                    : `<button class="btn btn-edit btn-small"
                        onclick="editCertificate('${c.id}', '${c.course_name.replace(/'/g, "\\'")}', '${(c.grade_note || "").replace(/'/g, "\\'")}')">
                        ${t("Edit")}
                      </button>
                      <button class="btn btn-delete btn-small" onclick="revokeCertificate('${c.id}')">
                        ${t("Revoke")}
                      </button>`
                  }
                  <button class="btn btn-delete btn-icon-only" onclick="deleteCertificate('${c.id}')" title="${t('Move to Trash')}">
                    🚮
                  </button>
                  <button class="btn btn-danger btn-icon-only" onclick="permanentDeleteCertificate('${c.id}')" title="${t('Permanently Delete')}">
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.appendChild(div);
}

async function issueCertificate() {
  const { matric, fullname, level } = window.certStudentData || {};
  const course_name = document.getElementById("certCourse").value;

  if (!matric || !fullname || !level || !course_name) {
    alert(t("Please select a course before issuing."));
    return;
  }

  const { data: freshCerts } = await db
    .from("certificates")
    .select("id, course_name, revoked")
    .eq("matric_number", matric)
    .eq("deleted", false);

  const alreadyIssued = (freshCerts || []).find(
    c => c.course_name === course_name && !c.revoked
  );

  if (alreadyIssued) {
    alert(`${t("An active certificate for")} "${course_name}" ${t("already exists for this student.")}`);
    return;
  }

  const grade_note = document.getElementById("certGradeNote")?.value.trim() || "";

  // Insert only the real columns that exist in the certificates table
  const { error } = await db.from("certificates").insert([{
    matric_number: matric,
    student_name: fullname,
    course_name: course_name,
    level: level,
    issued_by: "Al-Bayan Arabic Institute Online",
    grade_note: grade_note,
    deleted: false
  }]);

  if (error) {
    console.error("Certificate insert error:", error);
    alert(t("Failed to issue certificate. See console."));
    return;
  }

  await sendNotification(
    matric,
    t("Certificate Issued"),
    JSON.stringify({ key: "CERTIFICATE_ISSUED", data: { course: course_name } })
  );

  closeModal("certificateModal");
  showToast(`${t("Certificate issued to")} ${fullname} ✅`);
}

async function revokeCertificate(certId) {
  if (!confirm(t("Revoke this certificate? The student will no longer see it."))) return;

  const { error } = await db.from("certificates").update({ revoked: true }).eq("id", certId);

  if (error) { alert(t("Failed to revoke certificate.")); return; }

  showToast(t("Certificate revoked."));
  const { studentId, matric, fullname, level } = window.certStudentData;
  closeModal("certificateModal");
  await openCertificateModal(studentId, matric, fullname, level);
}

async function restoreCertificate(certId) {
  if (!confirm(t("Restore this certificate? The student will see it again."))) return;

  const { error } = await db.from("certificates").update({ revoked: false }).eq("id", certId);

  if (error) { alert(t("Failed to restore certificate.")); return; }

  showToast(t("Certificate restored ✅"));
  const { studentId, matric, fullname, level } = window.certStudentData;
  closeModal("certificateModal");
  await openCertificateModal(studentId, matric, fullname, level);
}

function editCertificate(certId, currentCourse, currentGradeNote) {
  const old = document.getElementById("certEditForm");
  if (old) old.remove();

  const container = document.getElementById("certHistoryScroll");
  const form = document.createElement("div");
  form.id = "certEditForm";
  form.style.cssText = `
    margin-top: 16px; padding: 16px;
    background: var(--surface-color);
    border: 1px solid var(--border-color); border-radius: 8px;
  `;

  form.innerHTML = `
    <h3 style="margin-bottom:12px; font-size:1rem;">${t("Edit Certificate")}</h3>
    <label style="font-weight:600; font-size:0.9rem;">${t("Course Name")}</label>
    <input type="text" id="editCertCourse" value="${currentCourse}"
      style="width:100%; padding:8px; margin:6px 0 12px; border-radius:6px; border:1px solid #ccc; font-size:0.9rem;">
    <label style="font-weight:600; font-size:0.9rem;">${t("Grade Note")}</label>
    <input type="text" id="editCertGradeNote" value="${currentGradeNote}"
      placeholder="${t("e.g. with a total score of 85%")}"
      style="width:100%; padding:8px; margin:6px 0 12px; border-radius:6px; border:1px solid #ccc; font-size:0.9rem;">
    <div style="display:flex; gap:10px;">
      <button class="btn btn-save" style="font-size:0.85rem;" onclick="saveCertificateEdit('${certId}')">
        ${t("Save Changes")}
      </button>
      <button class="btn btn-cancel" style="font-size:0.85rem;"
        onclick="document.getElementById('certEditForm').remove()">
        ${t("Cancel")}
      </button>
    </div>
  `;

  container.appendChild(form);
  form.scrollIntoView({ behavior: "smooth" });
}

async function saveCertificateEdit(certId) {
  const course_name = document.getElementById("editCertCourse")?.value.trim();
  const grade_note = document.getElementById("editCertGradeNote")?.value.trim();

  if (!course_name) {
    alert(t("Course name cannot be empty."));
    return;
  }

  const { error } = await db
    .from("certificates")
    .update({ course_name, grade_note })
    .eq("id", certId);

  if (error) {
    console.error("Edit certificate error:", error);
    alert(t("Failed to update certificate."));
    return;
  }

  showToast(t("Certificate updated ✅"));
  document.getElementById("certEditForm")?.remove();

  const { matric, fullname, level, studentId } = window.certStudentData;
  await openCertificateModal(studentId, matric, fullname, level);
}

// Soft delete — moves the certificate to trash (hidden from views, but
// still in Supabase, recoverable). Previously this function's confirm/
// toast text incorrectly said "permanently deleted" even though it only
// set deleted = true — fixed below. Use permanentDeleteCertificate() for
// an actual, irreversible delete.
async function deleteCertificate(certId) {
  if (!confirm(t("Move this certificate to Trash?\n\nIt will be hidden from the student and this list. Use the permanent delete (🗑️) option to remove it from Supabase for good."))) return;

  const { data, error } = await db
    .from("certificates")
    .update({ deleted: true })
    .eq("id", certId)
    .select();

  if (error) {
    console.error("Delete certificate error:", error);
    alert(t("Failed to delete certificate.") + " " + error.message);
    return;
  }

  if (!data || data.length === 0) {
    alert(t("Nothing was updated — check RLS policies in Supabase."));
    return;
  }

  showToast(t("Certificate moved to trash 🗑"));
  await refreshCertViews();
}

// Permanent delete — actually removes the row from Supabase.
async function permanentDeleteCertificate(certId) {
  if (!confirm(t("Permanently delete this certificate?\n\nThis cannot be undone."))) return;

  const { data, error } = await db.from("certificates").delete().eq("id", certId).select();

  if (error) {
    console.error("Permanent delete certificate error:", error);
    alert(t("Failed to permanently delete certificate.") + " " + error.message);
    return;
  }

  if (!data || data.length === 0) {
    alert(t("Nothing was deleted — check your Supabase RLS DELETE policy for this table."));
    return;
  }

  showToast(t("Certificate permanently deleted 🗑"));
  await refreshCertViews();
}
window.permanentDeleteCertificate = permanentDeleteCertificate;

// Refreshes whichever certificate view is currently relevant — the
// student's certificate modal (if open) and/or the registry tab table.
async function refreshCertViews() {
  if (window.certStudentData) {
    const { studentId, matric, fullname, level } = window.certStudentData;
    closeModal("certificateModal");
    await openCertificateModal(studentId, matric, fullname, level);
  }
  if (typeof loadCertificatesRegistryData === "function") {
    loadCertificatesRegistryData();
  }
}

/* -------------------------------------------------------
   COURSES — EDIT
   (Delete / Permanent Delete now handled by the generic
   softDelete()/permanentDelete() helpers — see DELETE ACTIONS section)
------------------------------------------------------- */
function editCourse(id, currentName, currentLevel, currentInstructor) {
  document.getElementById("courseName").value = currentName;
  document.getElementById("courseLevel").value = currentLevel;
  document.getElementById("courseInstructor").value = currentInstructor;

  window.editingCourseId = id;

  const btn = document.querySelector("[onclick='addCourse()']");
  if (btn) btn.textContent = t("Update Course");

  document.getElementById("courseName").scrollIntoView({ behavior: "smooth" });
}

/* -------------------------------------------------------
   ADMIN MY PROFILE
------------------------------------------------------- */
async function loadAdminProfile() {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    const { data: profile, error } = await db
      .from("profiles")
      .select("full_name, role, staff_type, department, phone, email, passport_url")
      .eq("id", user.id)
      .single();

    if (error || !profile) return;

    // Profile card
    const photoEl = document.getElementById("adminProfilePhoto");
    if (photoEl) photoEl.src = profile.passport_url || "passport-placeholder.png";

    const nameEl = document.getElementById("adminProfileName");
    if (nameEl) nameEl.textContent = profile.full_name || "—";

    const typeDeptEl = document.getElementById("adminProfileTypeDept");
    if (typeDeptEl) {
      const dept = profile.department
        ? profile.department.charAt(0).toUpperCase() + profile.department.slice(1)
        : "";
      typeDeptEl.textContent = dept || profile.role || "";
    }

    const roleTagEl = document.getElementById("adminRoleTag");
    if (roleTagEl) {
      const tagMap = {
        mudeer: "#Director", assistant_mudeer: "#Asst. Director",
        h_o_d: "#Head of Department",
        bursar: "#Bursar", registrar: "#Registrar", teacher: "#Teacher"
      };
      const classMap = {
        mudeer: "badge-success", assistant_mudeer: "badge-info",
        h_o_d: "badge-info",
        bursar: "badge-warning", registrar: "badge-default", teacher: "badge-teacher"
      };
      roleTagEl.textContent = tagMap[profile.role] || "#Staff";
      roleTagEl.className = `badge admin-role-badge ${classMap[profile.role] || "badge-default"}`;
    }

    // Form fields
    const fnEl = document.getElementById("adminFullName");
    if (fnEl) fnEl.value = profile.full_name || "";

    const emailEl = document.getElementById("adminEmail");
    if (emailEl) emailEl.value = user.email || profile.email || "";

    const phoneEl = document.getElementById("adminPhone");
    if (phoneEl) phoneEl.value = profile.phone || "";

    const deptEl = document.getElementById("adminDepartment");
    if (deptEl) deptEl.value = profile.department || "";

  } catch (e) {
    console.error("loadAdminProfile error:", e);
  }
}

async function saveAdminProfile() {
  const btn = document.getElementById("saveAdminProfileBtn");
  setLoading(btn, true);

  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    const full_name = document.getElementById("adminFullName")?.value.trim();
    const phone = document.getElementById("adminPhone")?.value.trim();
    const department = document.getElementById("adminDepartment")?.value;
    const passportFile = document.getElementById("adminPassportFile")?.files[0];

    if (!full_name) {
      alert(t("Full name is required"));
      return;
    }

    let passport_url = null;
    let passport_path = null;

    if (passportFile) {
      if (!passportFile.type.startsWith("image/")) {
        alert(t("Only image files are allowed"));
        return;
      }
      if (passportFile.size > 2 * 1024 * 1024) {
        alert(t("Passport must not exceed 2MB"));
        return;
      }

      const fileExt = passportFile.name.split(".").pop();
      const fileName = `admin_${Date.now()}_${Math.floor(Math.random() * 9999)}.${fileExt}`;

      const { error: uploadError } = await db.storage
        .from("passports")
        .upload(fileName, passportFile, { cacheControl: "3600" });

      if (uploadError) throw uploadError;

      const { data: publicData } = db.storage
        .from("passports")
        .getPublicUrl(fileName);

      passport_url = publicData.publicUrl;
      passport_path = fileName;
    }

    const updatePayload = {
      full_name,
      phone,
      department,
      ...(passport_url ? { passport_url, passport_path } : {})
    };

    const { error } = await db
      .from("profiles")
      .update(updatePayload)
      .eq("id", user.id);

    if (error) throw error;

    // Update session name
    sessionStorage.setItem("full_name", full_name);

    showToast(t("Profile updated successfully"));
    loadAdminProfile();
    setDashboardGreeting();

  } catch (e) {
    console.error("saveAdminProfile error:", e);
    alert(t("Failed to save profile. See console."));
  } finally {
    setLoading(btn, false);
  }
}

/* -------------------------------------------------------
   ADMIN MY PAYMENTS TAB
------------------------------------------------------- */
async function loadAdminMyPayments() {
  const tbody = document.getElementById("adminMyPaymentsBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="empty-row">
    <i class="fa-solid fa-spinner fa-spin"></i> ${t("Loading payments...")}
  </td></tr>`;

  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    // Fetch salary from profiles
    const { data: profile } = await db
      .from("profiles")
      .select("monthly_salary")
      .eq("id", user.id)
      .single();

    const monthlySalary = profile?.monthly_salary || 0;
    const monthlyEl = document.getElementById("adminPaySummaryMonthly");
    if (monthlyEl) monthlyEl.textContent = "₦" + Number(monthlySalary).toLocaleString();

    // Fetch payment records
    const { data, error } = await db
      .from("staff_payments")
      .select("*")
      .eq("staff_id", user.id)
      .order("year",  { ascending: false })
      .order("month", { ascending: false });

    if (error) throw error;

    const paidCountEl = document.getElementById("adminPaySummaryPaidCount");
    const totalEl     = document.getElementById("adminPaySummaryTotal");

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-row">${t("No payment records yet.")}</td></tr>`;
      if (paidCountEl) paidCountEl.textContent = "0";
      if (totalEl)     totalEl.textContent     = "₦0";
      return;
    }

    const months  = ["","January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
    const symbols = { NGN:"₦", USD:"$", EUR:"€", GBP:"£" };
    const statusClass = { paid:"badge-success", partial:"badge-warning", unpaid:"badge-danger" };

    const paidRows  = data.filter(p => p.status === "paid" || p.status === "partial");
    const totalPaid = paidRows.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);

    if (paidCountEl) paidCountEl.textContent = paidRows.length;
    if (totalEl)     totalEl.textContent     = "₦" + Math.round(totalPaid).toLocaleString();

    tbody.innerHTML = data.map(p => `
      <tr>
        <td>${t(months[p.month] || String(p.month))}</td>
        <td>${p.year}</td>
        <td>${(symbols[p.currency] || p.currency || "₦") + Number(p.amount_paid || 0).toLocaleString()}</td>
        <td>${p.currency || "NGN"}</td>
        <td><span class="badge ${statusClass[p.status] || "badge-default"}">${t(p.status)}</span></td>
        <td>${p.paid_on || "—"}</td>
        <td>${p.note   || "—"}</td>
      </tr>
    `).join("");

    window.reTranslate?.();

  } catch (e) {
    console.error("loadAdminMyPayments error:", e);
    const tbody = document.getElementById("adminMyPaymentsBody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-row">${t("Failed to load payments.")}</td></tr>`;
  }
}


/* -------------------------------------------------------
   POPULATE CERTIFICATE TAB MAIN TABLE
   Real columns: id, matric_number, student_name, course_name,
                 level, issued_by, issued_at, deleted, revoked, grade_note
------------------------------------------------------- */
async function loadCertificatesRegistryData() {
  try {
    const { data, error } = await window.supabaseClient
      .from('certificates')
      .select('id, matric_number, student_name, course_name, level, issued_by, issued_at, revoked, grade_note')
      .eq('deleted', false)
      .order('issued_at', { ascending: false });

    const tbody = document.getElementById("certRegistryTabBody");
    if (!tbody) return;

    if (error) {
      console.error("Error reading certificates table:", error);
      tbody.innerHTML = `<tr><td colspan="7" class="empty-row" style="color:red;">${t("Error loading certificate records.")}</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-row">${t("No certificates issued yet.")}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(c => {
      const formattedDate = c.issued_at ? new Date(c.issued_at).toLocaleDateString() : "—";
      const statusBadge = c.revoked
        ? `<span class="badge badge-danger" style="font-size:0.75rem;">${t("Revoked")}</span>`
        : `<span class="badge badge-success" style="font-size:0.75rem;">${t("Active")}</span>`;
      return `
        <tr>
          <td><strong>${c.student_name || "—"}</strong></td>
          <td><code style="font-size:0.85rem;">${c.matric_number || "—"}</code></td>
          <td>${c.course_name || "—"}</td>
          <td><span class="badge badge-info">${c.level || "—"}</span></td>
          <td>${statusBadge}</td>
          <td>${formattedDate}</td>
          <td>
            <div class="table-row-actions">
              <button class="btn btn-delete btn-icon-only" onclick="deleteCertificate('${c.id}')" title="${t('Move to Trash')}">
                🚮
              </button>
              <button class="btn btn-danger btn-icon-only" onclick="permanentDeleteCertificate('${c.id}')" title="${t('Permanently Delete')}">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    enableTableSearch("searchCertRegistry", "cert-registry-table");
    window.reTranslate?.();
  } catch (err) {
    console.error("Cert dashboard view render failure:", err);
  }
}

// Bind it to the window scope so your switchDashTab handles it instantly
window.fetchAndRenderCertRegistry = loadCertificatesRegistryData;


/* -------------------------------------------------------
   AUTONOMOUS DELETED TAB PANEL (STANDALONE TRASH BIN)
------------------------------------------------------- */
/* -------------------------------------------------------
   CONSOLIDATED TRASH BIN (tab-deleted)
   One panel, one table — switch which entity's soft-deleted
   rows are shown using the category chips. Each category
   defines its own columns + how to read each row's "match" key
   (a plain id for most tables, matric_number+month for fees).
------------------------------------------------------- */
const TRASH_CATEGORIES = {
  students: {
    labelKey: "Students",
    table: "students",
    orderCol: "fullname",
    ascending: true,
    headers: () => [t("Photo"), t("Matric"), t("Name"), t("Email"), t("Country"), t("Level")],
    row: s => `
      <td><img src="${s.passport_url || 'passport-placeholder.png'}" class="passport-thumb" style="width:35px;height:35px;border-radius:50%;object-fit:cover;"></td>
      <td>${s.matric_number || "—"}</td>
      <td><strong>${s.fullname || "—"}</strong></td>
      <td>${s.email || "—"}</td>
      <td>${s.country || "—"}</td>
      <td>${s.level_arabic || "—"}</td>
    `,
    match: s => ({ id: s.id })
  },
  payments: {
    labelKey: "Payments",
    table: "payments",
    orderCol: "created_at",
    ascending: false,
    headers: () => [t("Student Name"), t("Matric Number"), t("Amount"), t("Month")],
    row: p => `
      <td>${p.student_name || "—"}</td>
      <td>${p.matric_number || "—"}</td>
      <td>${p.amount != null ? Number(p.amount).toLocaleString() : "—"}</td>
      <td>${p.month || "—"}</td>
    `,
    match: p => ({ id: p.id })
  },
  grades: {
    labelKey: "Grades",
    table: "grades",
    orderCol: "created_at",
    ascending: false,
    headers: () => [t("Student Name"), t("Matric Number"), t("Course"), t("Semester")],
    row: g => `
      <td>${g.student_name || "—"}</td>
      <td>${g.matric_number || "—"}</td>
      <td>${g.course || "—"}</td>
      <td>${g.semester || "—"}</td>
    `,
    match: g => ({ id: g.id })
  },
  schedule: {
    labelKey: "Schedule",
    table: "schedule",
    orderCol: "created_at",
    ascending: false,
    headers: () => [t("Course"), t("Level"), t("Date"), t("Time")],
    row: c => `
      <td>${c.course || "—"}</td>
      <td>${c.level || "—"}</td>
      <td>${c.date || "—"}</td>
      <td>${c.time || "—"}</td>
    `,
    match: c => ({ id: c.id })
  },
  assessments: {
    labelKey: "Assessments",
    table: "assessments",
    orderCol: "created_at",
    ascending: false,
    headers: () => [t("Title"), t("Course"), t("Level"), t("Start Time")],
    row: a => `
      <td>${a.title || "—"}</td>
      <td>${a.course || "—"}</td>
      <td>${a.level || "—"}</td>
      <td>${a.start_time || "—"}</td>
    `,
    match: a => ({ id: a.id })
  },
  courses: {
    labelKey: "Courses",
    table: "courses",
    orderCol: "created_at",
    ascending: false,
    headers: () => [t("Course Name"), t("Level"), t("Instructor")],
    row: c => `
      <td>${c.course_name || "—"}</td>
      <td>${c.level || "—"}</td>
      <td>${c.instructor || "—"}</td>
    `,
    match: c => ({ id: c.id })
  },
  attendance_sessions: {
    labelKey: "Attendance",
    table: "attendance_sessions",
    orderCol: "opens_at",
    ascending: false,
    headers: () => [t("Title"), t("Level"), t("Opens"), t("Closes")],
    row: s => `
      <td>${s.title || "—"}</td>
      <td>${s.level || "—"}</td>
      <td>${s.opens_at ? new Date(s.opens_at).toLocaleString() : "—"}</td>
      <td>${s.closes_at ? new Date(s.closes_at).toLocaleString() : "—"}</td>
    `,
    match: s => ({ id: s.id })
  },
  student_fee_status: {
    labelKey: "Fees",
    table: "student_fee_status",
    orderCol: "created_at",
    ascending: false,
    headers: () => [t("Matric Number"), t("Month"), t("Amount"), t("Status")],
    row: f => `
      <td>${f.matric_number || "—"}</td>
      <td>${f.month || "—"}</td>
      <td>₦${Number(f.amount_due || 0).toLocaleString()}</td>
      <td>${f.status === "paid" ? t("✅ Paid") : t("❌ Unpaid")}</td>
    `,
    match: f => ({ matric_number: f.matric_number, month: f.month })
  },
  certificates: {
    labelKey: "Certificates",
    table: "certificates",
    orderCol: "issued_at",
    ascending: false,
    headers: () => [t("Student Name"), t("Matric Number"), t("Course"), t("Date Issued")],
    row: c => `
      <td>${c.student_name || "—"}</td>
      <td>${c.matric_number || "—"}</td>
      <td>${c.course_name || "—"}</td>
      <td>${c.issued_at ? new Date(c.issued_at).toLocaleDateString() : "—"}</td>
    `,
    match: c => ({ id: c.id })
  }
};

window.currentTrashCategory = window.currentTrashCategory || "students";

function renderTrashCategoryChips() {
  const wrap = document.getElementById("trashCategoryChips");
  if (!wrap) return;

  wrap.innerHTML = Object.entries(TRASH_CATEGORIES).map(([key, cat]) => `
    <button type="button" class="trash-chip ${key === window.currentTrashCategory ? "active" : ""}"
      onclick="switchTrashCategory('${key}')">
      ${t(cat.labelKey)}
    </button>
  `).join("");
}

window.switchTrashCategory = function (key) {
  if (!TRASH_CATEGORIES[key]) return;
  window.currentTrashCategory = key;
  const searchInput = document.getElementById("searchTrashTab");
  if (searchInput) searchInput.value = "";
  loadDeletedTabPanelContent(key);
};

async function loadDeletedTabPanelContent(category) {
  category = category || window.currentTrashCategory || "students";
  window.currentTrashCategory = category;

  const cat = TRASH_CATEGORIES[category];
  if (!cat) return;

  renderTrashCategoryChips();

  const thead = document.getElementById("trashTabPanelHead");
  const tbody = document.getElementById("trashTabPanelBody");
  if (!tbody) return;

  const headerLabels = cat.headers();
  const colCount = headerLabels.length + 1; // + Actions column

  if (thead) {
    thead.innerHTML = `<tr>${headerLabels.map(h => `<th>${h}</th>`).join("")}<th>${t("Actions")}</th></tr>`;
  }

  try {
    const { data, error } = await db
      .from(cat.table)
      .select("*")
      .eq("deleted", true)
      .order(cat.orderCol, { ascending: cat.ascending });

    if (error) {
      console.error("Trash bin fetch error:", error);
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-row" style="color:red;">${t("Error parsing trash data.")}</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-row">${t("Trash bin is empty.")}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(row => {
      const matchAttr = JSON.stringify(cat.match(row)).replace(/'/g, "&#39;");
      return `
        <tr>
          ${cat.row(row)}
          <td>
            <div class="table-row-actions">
              <button class="btn btn-save btn-small" data-trash-action="restore" data-table="${cat.table}" data-match='${matchAttr}'>
                <i class="fa-solid fa-trash-arrow-up"></i> ${t("Restore")}
              </button>
              <button class="btn btn-danger btn-icon-only" data-trash-action="permanent" data-table="${cat.table}" data-label-key="${cat.labelKey}" data-match='${matchAttr}' title="${t('Permanently Delete')}">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    if (!window._trashSearchWired) {
      enableTableSearch("searchTrashTab", "students-trash-panel-table");
      window._trashSearchWired = true;
    }
    window.reTranslate?.();
  } catch (err) {
    console.error("Trash panel rendering failure:", err);
  }
}
window.fetchAndRenderTrashTab = loadDeletedTabPanelContent;

// Single delegated listener handles Restore + Permanent Delete for every
// category — avoids the quote-escaping issues that inline onclick handlers
// run into with names/values that may contain apostrophes.
document.getElementById("trashTabPanelBody")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-trash-action]");
  if (!btn) return;

  const action = btn.dataset.trashAction;
  const table = btn.dataset.table;
  let match;
  try {
    match = JSON.parse(btn.getAttribute("data-match"));
  } catch {
    return;
  }

  if (action === "restore") {
    if (!confirm(t("Restore this item?"))) return;
    await restoreDeleted({ table, match, reloadFn: () => loadDeletedTabPanelContent() });
  } else if (action === "permanent") {
    const labelKey = btn.dataset.labelKey || table;
    await permanentDelete({
      table,
      match,
      reloadFn: () => loadDeletedTabPanelContent(),
      label: t(labelKey)
    });
  }
});

/* -------------------------------------------------------
   ATTENDANCE TAB
   Tables: attendance_sessions, attendance_records
   RPCs used elsewhere (student-facing): get_session_by_token, mark_attendance
------------------------------------------------------- */

function generateAttendanceToken() {
  // 24 hex chars, no DB round-trip needed just to preview the link
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function buildAttendanceUrl(token) {
  return `${window.location.origin}/attendance.html?token=${token}`;
}

async function loadAttendanceSessions() {
  const tbody = document.getElementById("attendance-sessions-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="empty-row">
    <i class="fa-solid fa-spinner fa-spin"></i> ${t("Loading sessions...")}
  </td></tr>`;

  try {
    const { data: sessions, error } = await db
      .from("attendance_sessions")
      .select("*")
      .eq("deleted", false)
      .order("opens_at", { ascending: false });

    if (error) throw error;

    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-row">${t("No attendance sessions yet")}</td></tr>`;
      return;
    }

    // Get present-counts for all sessions in one query instead of one-per-row
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
        <td><span class="badge badge-info">${t(s.level)}</span></td>
        <td>${formatDate(s.opens_at)}</td>
        <td>${formatDate(s.closes_at)}</td>
        <td>
          <button class="btn btn-edit btn-small" onclick="viewAttendanceRecords('${s.id}', '${escapeForAttr(s.title)}')">
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
          <div class="table-row-actions">
            <button class="btn btn-edit btn-small" onclick="copySessionLinkDirect('${s.attendance_token}')" title="${t('Copy attendance link')}">
              <i class="fa-solid fa-link"></i>
            </button>
            <button class="btn btn-edit btn-small" onclick="editAttendanceSession('${s.id}')">
              ${t("Edit")}
            </button>
            <button class="btn btn-delete btn-icon-only" onclick="deleteAttendanceSession('${s.id}')" title="${t('Delete')}">
              <i class="fa-solid fa-trash"></i>
            </button>
            <button class="btn btn-danger btn-icon-only" onclick="permanentDeleteAttendanceSession('${s.id}')" title="${t('Permanently Delete')}">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `).join("");

    enableTableSearch("searchAttendance", "attendance-sessions-table");
    window.reTranslate?.();

  } catch (e) {
    console.error("loadAttendanceSessions error:", e);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row" style="color:red;">${t("Failed to load attendance sessions.")}</td></tr>`;
  }
}

function escapeForAttr(str) {
  return String(str || "").replace(/'/g, "\\'");
}

async function addAttendanceSession() {
  const btn = document.getElementById("addAttendanceSessionBtn");
  setLoading(btn, true);

  try {
    const title = document.getElementById("attendanceTitle").value.trim();
    const level = document.getElementById("attendanceLevel").value;
    const opensAtRaw = document.getElementById("attendanceOpensAt").value;
    const closesAtRaw = document.getElementById("attendanceClosesAt").value;
    const platformLink = document.getElementById("attendancePlatformLink").value.trim();

    if (!title || !level || !opensAtRaw || !closesAtRaw) {
      alert(t("Fill all required fields"));
      setLoading(btn, false);
      return;
    }

    if (isNaN(new Date(opensAtRaw)) || isNaN(new Date(closesAtRaw))) {
      alert(t("Invalid date"));
      setLoading(btn, false);
      return;
    }

    const opensAt = new Date(opensAtRaw).toISOString();
    const closesAt = new Date(closesAtRaw).toISOString();

    if (new Date(closesAt) <= new Date(opensAt)) {
      alert(t("Closing time must be after opening time"));
      setLoading(btn, false);
      return;
    }

    if (window.editingAttendanceSessionId) {
      const { error } = await db.from("attendance_sessions").update({
        title, level, opens_at: opensAt, closes_at: closesAt,
        platform_link: platformLink || null
      }).eq("id", window.editingAttendanceSessionId);

      if (error) throw error;
      showToast(t("Session updated"));
      window.editingAttendanceSessionId = null;
      closeModal("attendanceSessionModal");

    } else {
      const token = generateAttendanceToken();

      const { data, error } = await db.from("attendance_sessions").insert([{
        title, level, opens_at: opensAt, closes_at: closesAt,
        platform_link: platformLink || null,
        attendance_token: token,
        is_active: true
      }]).select().single();

      if (error) { console.error("Insert error:", error); throw error; }

      showToast(t("Session created"));

      // Show the generated link instead of closing — admin needs to copy it
      const linkBox = document.getElementById("attendanceLinkBox");
      const linkInput = document.getElementById("attendanceGeneratedLink");
      linkInput.value = buildAttendanceUrl(data.attendance_token);
      linkBox.style.display = "block";
    }

    loadAttendanceSessions();

  } catch (e) {
    console.error("Add/Edit attendance session error:", e);
    alert(t("Failed to save attendance session"));
  } finally {
    setLoading(btn, false);
  }
}

async function editAttendanceSession(id) {
  const { data: s, error } = await db.from("attendance_sessions").select("*").eq("id", id).single();
  if (error || !s) return;

  document.getElementById("attendanceModalTitle").textContent = t("Edit Attendance Session");
  document.getElementById("attendanceTitle").value = s.title;
  document.getElementById("attendanceLevel").value = s.level;
  document.getElementById("attendanceOpensAt").value = formatForInput(s.opens_at);
  document.getElementById("attendanceClosesAt").value = formatForInput(s.closes_at);
  document.getElementById("attendancePlatformLink").value = s.platform_link || "";

  const linkBox = document.getElementById("attendanceLinkBox");
  const linkInput = document.getElementById("attendanceGeneratedLink");
  linkInput.value = buildAttendanceUrl(s.attendance_token);
  linkBox.style.display = "block";

  window.editingAttendanceSessionId = id;
  document.getElementById("attendanceSessionModal").classList.add("show");
}

async function toggleAttendanceSession(id, isActive) {
  const { error } = await db.from("attendance_sessions")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    alert(t("Failed to update session"));
    console.error(error);
    return;
  }
  showToast(isActive ? t("Session activated") : t("Session deactivated"));
}

function copySessionLinkDirect(token) {
  const url = buildAttendanceUrl(token);
  navigator.clipboard.writeText(url)
    .then(() => showToast(t("Link copied")))
    .catch(() => alert(url)); // fallback: show it so they can copy manually
}

function copyAttendanceLink() {
  const linkInput = document.getElementById("attendanceGeneratedLink");
  if (!linkInput || !linkInput.value) return;
  navigator.clipboard.writeText(linkInput.value)
    .then(() => showToast(t("Link copied")))
    .catch(() => alert(linkInput.value));
}

async function viewAttendanceRecords(sessionId, sessionTitle) {
  document.getElementById("attendanceRecordsTitle").textContent =
    `${t("Attendance Records")} — ${sessionTitle}`;

  const tbody = document.getElementById("attendance-records-body");
  tbody.innerHTML = `<tr><td colspan="3" class="empty-row">
    <i class="fa-solid fa-spinner fa-spin"></i> ${t("Loading...")}
  </td></tr>`;

  openModal("attendanceRecordsModal");

  try {
    const { data: records, error } = await db
      .from("attendance_records")
      .select("attended_at, student_matric")
      .eq("session_id", sessionId)
      .order("attended_at", { ascending: true });

    if (error) throw error;

    if (!records || records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-row">${t("No one has marked attendance yet.")}</td></tr>`;
      return;
    }

    // Resolve student names/matric numbers in one batch query
    const matricNumbers = records.map(r => r.student_matric);

const { data: students } = await db
  .from("students")
  .select("matric_number, fullname")
  .in("matric_number", matricNumbers);

const studentMap = {};
(students || []).forEach(s => {
  studentMap[s.matric_number] = s;
});

    tbody.innerHTML = records.map(r => {
      const s = studentMap[r.student_matric] || {};
      return `
        <tr>
          <td>${s.matric_number || "—"}</td>
          <td>${s.fullname || "—"}</td>
          <td>${formatDate(r.attended_at)}</td>
        </tr>
      `;
    }).join("");

  } catch (e) {
    console.error("viewAttendanceRecords error:", e);
    tbody.innerHTML = `<tr><td colspan="3" class="empty-row" style="color:red;">${t("Failed to load records.")}</td></tr>`;
  }
}

window.loadAttendanceSessions = loadAttendanceSessions;

// =====================================================
// SNIPPET 4 — VIDEO LIBRARY ADMIN FUNCTIONS
// Paste anywhere near the bottom of admin-dashboard.js
// (before the closing of DOMContentLoaded or after all
//  other feature blocks — it doesn't matter where)
// =====================================================

// ===================================================
// VIDEO LIBRARY ADMIN (tab-videos)
// ===================================================

let vlBooks       = {}; // cache: bookId → book row (avoids re-fetch for edit)
let vlEditBookId  = null;
let vlEditVideoId = null;

// Called by switchDashTab whenever tab-videos is opened
async function loadVideoLibraryTab() {
  await vlPopulateCourseDropdowns();
  await vlLoadBooks();
  await vlLoadVideos();
}

// Fill every course <select> in the tab with current courses
async function vlPopulateCourseDropdowns() {
  const { data: courses } = await db
    .from("courses")
    .select("id, course_name")
    .eq("deleted", false)
    .order("created_at");

  const opts =
    `<option value="">Select Course</option>` +
    (courses || []).map(c => `<option value="${c.id}">${c.course_name}</option>`).join("");

  ["vl-book-course", "vl-video-filter-course", "vl-modal-course"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}


// ── BOOKS ─────────────────────────────────────────

async function vlLoadBooks() {
  const tbody = document.getElementById("vl-books-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Loading...</td></tr>`;

  const { data: books, error } = await db
    .from("books")
    .select("id, title, order_index, course_id, courses(course_name)")
    .eq("deleted", false)
    .order("order_index");

  vlBooks = {};

  if (error || !books?.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row" data-translate="No books yet">No books yet</td></tr>`;
    return;
  }

  books.forEach(b => (vlBooks[b.id] = b));

  tbody.innerHTML = books.map(b => `
    <tr>
      <td>${b.courses?.course_name || "—"}</td>
      <td>${b.title}</td>
      <td>${b.order_index}</td>
      <td>
        <button class="btn btn-edit" onclick="vlEditBook('${b.id}')">
          <i class="fa-solid fa-pen"></i>
        </button>
      </td>
      <td>
        <button class="btn btn-delete" onclick="vlDeleteBook('${b.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join("");
}

async function vlSaveBook() {
  const courseId = document.getElementById("vl-book-course").value;
  const title    = document.getElementById("vl-book-title").value.trim();
  const order    = parseInt(document.getElementById("vl-book-order").value) || 0;
  const btn      = document.getElementById("vl-save-book-btn");

  if (!courseId || !title) {
    showToast("Please select a course and enter a book title.", "error");
    return;
  }

  btn.disabled = true;
  const payload = { course_id: courseId, title, order_index: order };

  if (vlEditBookId) {
    // Update existing book
    const { error } = await db.from("books").update(payload).eq("id", vlEditBookId).select();
    if (error) { showToast("Error: " + error.message, "error"); btn.disabled = false; return; }
    showToast("Book updated.", "success");
  } else {
    // Insert new book — use RLS silent-failure check
    const { data, error } = await db.from("books").insert(payload).select();
    if (error) { showToast("Error: " + error.message, "error"); btn.disabled = false; return; }
    if (!data || data.length === 0) {
      showToast("Blocked by permissions. Check RLS policies.", "error");
      btn.disabled = false;
      return;
    }
    showToast("Book added.", "success");
  }

  // Reset form
  vlEditBookId = null;
  document.getElementById("vl-book-course").value = "";
  document.getElementById("vl-book-title").value  = "";
  document.getElementById("vl-book-order").value  = "";
  btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Add Book</span>`;
  btn.disabled  = false;

  await vlLoadBooks();
  await vlRefreshModalBookDropdown(); // keep video modal book list fresh
}

function vlEditBook(id) {
  const b = vlBooks[id];
  if (!b) return;
  vlEditBookId = id;
  document.getElementById("vl-book-course").value = b.course_id;
  document.getElementById("vl-book-title").value  = b.title;
  document.getElementById("vl-book-order").value  = b.order_index;
  document.getElementById("vl-save-book-btn").innerHTML =
    `<i class="fa-solid fa-floppy-disk"></i> <span>Update Book</span>`;
  document.getElementById("vl-book-title").focus();
  // Scroll form into view on mobile
  document.getElementById("vl-book-title").scrollIntoView({ behavior: "smooth", block: "center" });
}

function vlCancelEditBook() {
  vlEditBookId = null;
  document.getElementById("vl-book-course").value = "";
  document.getElementById("vl-book-title").value  = "";
  document.getElementById("vl-book-order").value  = "";
  document.getElementById("vl-save-book-btn").innerHTML =
    `<i class="fa-solid fa-floppy-disk"></i> <span>Add Book</span>`;
}

async function vlDeleteBook(id) {
  if (!confirm("Soft-delete this book? It will be hidden from students but can be restored.")) return;
  const { error } = await db.from("books").update({ deleted: true }).eq("id", id);
  if (error) { showToast("Error: " + error.message, "error"); return; }
  showToast("Book deleted.", "success");
  await vlLoadBooks();
}


// ── VIDEO MODAL ────────────────────────────────────

// Called when course changes in the modal
async function vlLoadModalBooks() {
  const courseId = document.getElementById("vl-modal-course")?.value;
  const bookSel  = document.getElementById("vl-modal-book");
  if (!bookSel) return;

  if (!courseId) {
    bookSel.innerHTML = `<option value="">Select Course First</option>`;
    return;
  }

  const { data: books } = await db
    .from("books")
    .select("id, title")
    .eq("course_id", courseId)
    .eq("deleted", false)
    .order("order_index");

  bookSel.innerHTML =
    `<option value="">Select Book</option>` +
    (books || []).map(b => `<option value="${b.id}">${b.title}</option>`).join("");
}

// Silently refresh modal book dropdown (called after saving a book)
async function vlRefreshModalBookDropdown() {
  await vlLoadModalBooks();
}

function vlOpenAddVideo() {
  vlEditVideoId = null;
  document.getElementById("vl-modal-heading").textContent    = "Add Video";
  document.getElementById("vl-modal-course").value           = "";
  document.getElementById("vl-modal-book").innerHTML         = `<option value="">Select Course First</option>`;
  document.getElementById("vl-modal-title-input").value      = "";
  document.getElementById("vl-modal-language").value         = "english";
  document.getElementById("vl-modal-month").value            = "";
  document.getElementById("vl-modal-youtube").value          = "";
  document.getElementById("vl-modal-telegram").value         = "";
  openModal("videoLibModal");
}

async function vlEditVideo(id) {
  // videos.id is bigint so pass as number, not string
  const { data: v, error } = await db
    .from("videos")
    .select("*, books(course_id)")
    .eq("id", id)
    .single();

  if (error || !v) { showToast("Could not load video.", "error"); return; }

  vlEditVideoId = id;
  document.getElementById("vl-modal-heading").textContent = "Edit Video";

  // Set course, load books for that course, then set the book
  document.getElementById("vl-modal-course").value = v.books?.course_id || "";
  await vlLoadModalBooks();
  document.getElementById("vl-modal-book").value          = v.book_id || "";
  document.getElementById("vl-modal-title-input").value   = v.title || "";
  document.getElementById("vl-modal-language").value      = v.language || "english";
  document.getElementById("vl-modal-month").value         = v.month || "";
  document.getElementById("vl-modal-youtube").value       = v.youtube_link || "";
  document.getElementById("vl-modal-telegram").value      = v.telegram_link || "";

  openModal("videoLibModal");
}

async function vlSaveVideo() {
  const bookId   = document.getElementById("vl-modal-book").value;
  const title    = document.getElementById("vl-modal-title-input").value.trim();
  const language = document.getElementById("vl-modal-language").value;
  const month    = document.getElementById("vl-modal-month").value;
  const ytLink   = document.getElementById("vl-modal-youtube").value.trim();
  const tgLink   = document.getElementById("vl-modal-telegram").value.trim();
  const saveBtn  = document.getElementById("vl-modal-save-btn");

  if (!bookId || !title || !ytLink) {
    showToast("Book, title and YouTube ID are required.", "error");
    return;
  }

  saveBtn.disabled = true;
  const payload = {
    book_id: bookId,
    title,
    language,
    month,
    youtube_link: ytLink,
    telegram_link: tgLink || null
  };

  if (vlEditVideoId) {
    const { error } = await db.from("videos").update(payload).eq("id", vlEditVideoId).select();
    if (error) { showToast("Error: " + error.message, "error"); saveBtn.disabled = false; return; }
    showToast("Video updated.", "success");
  } else {
    const { data, error } = await db.from("videos").insert(payload).select();
    if (error) { showToast("Error: " + error.message, "error"); saveBtn.disabled = false; return; }
    // RLS silent-failure check
    if (!data || data.length === 0) {
      showToast("Blocked by permissions. Check RLS policies.", "error");
      saveBtn.disabled = false;
      return;
    }
    showToast("Video added.", "success");
  }

  saveBtn.disabled = false;
  closeModal("videoLibModal");
  await vlLoadVideos();
}

async function vlDeleteVideo(id) {
  if (!confirm("Permanently delete this video? This cannot be undone.")) return;
  const { error } = await db.from("videos").delete().eq("id", id);
  if (error) { showToast("Error: " + error.message, "error"); return; }
  showToast("Video deleted.", "success");
  await vlLoadVideos();
}


// ── VIDEOS TABLE ───────────────────────────────────

async function vlLoadVideos() {
  const courseFilter = document.getElementById("vl-video-filter-course")?.value;
  const bookFilter   = document.getElementById("vl-video-filter-book")?.value;
  const tbody = document.getElementById("vl-videos-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Loading...</td></tr>`;

  let query = db
    .from("videos")
    .select("id, title, language, month, youtube_link, book_id, books(title, course_id, courses(course_name))")
    .not("book_id", "is", null)
    .order("created_at", { ascending: false });

  if (bookFilter) {
    query = query.eq("book_id", bookFilter);
  } else if (courseFilter) {
    // Filter by course: first get book IDs for that course
    const { data: bids } = await db
      .from("books")
      .select("id")
      .eq("course_id", courseFilter)
      .eq("deleted", false);

    if (bids?.length) {
      query = query.in("book_id", bids.map(b => b.id));
    } else {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No videos found for this course</td></tr>`;
      return;
    }
  }

  const { data: videos, error } = await query;

  if (error || !videos?.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row" data-translate="No videos yet">No videos yet</td></tr>`;
    return;
  }

  tbody.innerHTML = videos.map(v => `
    <tr>
      <td>${v.books?.courses?.course_name || "—"}</td>
      <td>${v.books?.title || "—"}</td>
      <td>${v.title || "—"}</td>
      <td>
        <span class="lang-pill ${v.language || ''}">
          ${v.language === "arabic" ? "Arabic" : v.language === "english" ? "English" : v.language || "—"}
        </span>
      </td>
      <td>${v.month || "—"}</td>
      <td>
        ${v.youtube_link
          ? `<a href="https://youtu.be/${v.youtube_link}" target="_blank" rel="noopener" class="link-small">▶ Preview</a>`
          : "—"}
      </td>
      <td>
        <button class="btn btn-edit" onclick="vlEditVideo(${v.id})">
          <i class="fa-solid fa-pen"></i>
        </button>
      </td>
      <td>
        <button class="btn btn-delete" onclick="vlDeleteVideo(${v.id})">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join("");
}

// Called when course filter changes — refreshes book filter dropdown then reloads table
async function vlLoadFilterBooks() {
  const courseId = document.getElementById("vl-video-filter-course")?.value;
  const bookSel  = document.getElementById("vl-video-filter-book");
  if (!bookSel) return;

  if (!courseId) {
    bookSel.innerHTML = `<option value="">-- All Books --</option>`;
    await vlLoadVideos();
    return;
  }

  const { data: books } = await db
    .from("books")
    .select("id, title")
    .eq("course_id", courseId)
    .eq("deleted", false)
    .order("order_index");

  bookSel.innerHTML =
    `<option value="">-- All Books --</option>` +
    (books || []).map(b => `<option value="${b.id}">${b.title}</option>`).join("");

  await vlLoadVideos();
}
