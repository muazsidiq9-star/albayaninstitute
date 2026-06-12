// ===========================
// Admin Guard (FIXED)
// ===========================
const db = window.supabaseClient;

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

    setDashboardGreeting();

    await loadStats();

    if (role === "registrar") {
      loadStudents();
      loadPayments();
      loadFees();
      loadCoursesAdmin();
    }

    if (role === "bursar") {
      loadPayments();
      loadFees();
    }

    if (["mudeer", "assistant_mudeer"].includes(role)) {
      loadStudents();
      loadPayments();
      loadGrades();
      loadSchedule();
      loadAssessments();
      loadCoursesAdmin();
      loadFees();
    }

    populateStudentSelects();
    loadStudentDropdown();
    loadPasswordStudentDropdown();
    updateUnreadCounter();

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
    assessmentModal: "editingAssessmentId"
  };

  const key = editMap[id];
  if (key) window[key] = null;

  modal.classList.add("show");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.remove("show");

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
    assessmentModal: "editingAssessmentId"
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
  banner.style.background = "linear-gradient(135deg, #3b82f6, #2563eb)";
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
async function loadStats() {
  try {
    const { count: studentCount, error: sErr } = await db
      .from("students")
      .select("*", { count: "exact", head: true });

    if (!sErr) {
      document.getElementById("totalStudents").textContent = studentCount || 0;
    }

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
        <td><button class="btn btn-delete" onclick="deleteStudent('${s.id}')">${t("Delete")}</button></td>
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

      const { error: uploadError } = await db.storage
        .from("passports")
        .upload(fileName, passportFile, { cacheControl: "3600", upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicData } = db.storage
        .from("passports")
        .getPublicUrl(fileName);

      passport_url = publicData.publicUrl;
    }

    if (window.editingStudentId) {
      await db.from("students").update({
        fullname, email, whatsapp, country, gender, age,
        level_arabic, status, admission_approved,
        ...(passport_url ? { passport_url } : {})
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
        level_arabic, status, admission_approved, passport_url
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
        <td><button class="btn btn-delete" onclick="deletePayment('${p.id}')">${t("Delete")}</button></td>
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

async function deleteFee(matric, month) {
  if (!confirm(t("Delete this record?"))) return;
  await db
    .from("student_fee_status")
    .delete()
    .eq("matric_number", matric)
    .eq("month", month);
  loadFees();
}

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
          <td><button class="btn btn-delete" onclick="deleteGrade('${g.id}')">${t("Delete")}</button></td>
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
          <td><button class="btn btn-delete" onclick="deleteSchedule('${c.id}')">${t("Delete")}</button></td>
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
    const { data } = await db.from("assessments").select("*").order("start_time");
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
          <td><button class="btn btn-edit" onclick="editAssessment('${a.id}')">${t("Edit")}</button></td>
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
  const level = document.getElementById("courseLevel").value.trim();
  const instructor = document.getElementById("courseInstructor").value.trim();

  if (!name) {
    alert(t("Course name is required"));
    return;
  }

  if (window.editingCourseId) {
    const { error } = await db
      .from("courses")
      .update({ course_name: name, level, instructor })
      .eq("id", window.editingCourseId);

    if (error) {
      console.error(error);
      alert(t("Error updating course"));
      return;
    }

    showToast(t("Course updated ✅"));
    window.editingCourseId = null;

    const btn = document.querySelector("[onclick='addCourse()']");
    if (btn) btn.textContent = t("Add Course");
  } else {
    const { error } = await db
      .from("courses")
      .insert([{ course_name: name, level, instructor }]);

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
        <button class="btn btn-danger" onclick="deleteCourse('${course.id}')">
          ${t("Delete")}
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
------------------------------------------------------- */
async function softDelete({ table, id, reloadFn, label }) {
  if (!confirm(`${t("Delete this")} ${label}? ${t("You can undo this.")}`)) return;

  await db.from(table).update({ deleted: true }).eq("id", id);

  window.lastDeleted = { table, id, reloadFn };

  showToast(`${label} ${t("deleted. Undo?")}`);
  reloadFn();

  setTimeout(() => { window.lastDeleted = null; }, 10000);
}

window.deleteStudent = id =>
  softDelete({ table: "students", id, reloadFn: loadStudents, label: t("student") });

window.deletePayment = id =>
  softDelete({ table: "payments", id, reloadFn: loadPayments, label: t("payment") });

window.deleteGrade = id =>
  softDelete({ table: "grades", id, reloadFn: loadGrades, label: t("grade") });

window.deleteSchedule = id =>
  softDelete({ table: "schedule", id, reloadFn: loadSchedule, label: t("schedule") });

/* -------------------------------------------------------
   UNDO
------------------------------------------------------- */
async function undoDelete() {
  if (!window.lastDeleted) {
    alert(t("Nothing to undo"));
    return;
  }

  const { table, id, reloadFn } = window.lastDeleted;
  await db.from(table).update({ deleted: false }).eq("id", id);
  window.lastDeleted = null;
  reloadFn();
  showToast(t("Undo successful"));
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

  const container = document.getElementById("certificateModal").querySelector(".modal-content");
  const div = document.createElement("div");
  div.id = "existingCertsList";
  div.style.marginTop = "20px";

  div.innerHTML = `
    <h3 style="margin-bottom:10px; font-size:1rem;">${t("Issued Certificates")}</h3>
    <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
      <thead>
        <tr>
          <th style="padding:8px; background:#0077cc; color:#fff; text-align:left;">${t("Course")}</th>
          <th style="padding:8px; background:#0077cc; color:#fff; text-align:left;">${t("Grade Note")}</th>
          <th style="padding:8px; background:#0077cc; color:#fff; text-align:left;">${t("Status")}</th>
          <th style="padding:8px; background:#0077cc; color:#fff; text-align:left;">${t("Actions")}</th>
        </tr>
      </thead>
      <tbody>
        ${certs.map(c => `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px;">${c.course_name}</td>
            <td style="padding:8px; color:var(--text-color); font-size:0.82rem;">
              ${c.grade_note || "—"}
            </td>
            <td style="padding:8px;">
              ${c.revoked
                ? `<span style="color:#dc2626; font-weight:600;">${t("Revoked")}</span>`
                : `<span style="color:#16a34a; font-weight:600;">${t("Active")}</span>`
              }
            </td>
            <td style="padding:8px;">
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${c.revoked
                  ? `<button class="btn btn-save" style="font-size:0.8rem; padding:4px 10px;"
                      onclick="restoreCertificate('${c.id}')">${t("Restore")}</button>`
                  : `<button class="btn btn-edit" style="font-size:0.8rem; padding:4px 10px;"
                      onclick="editCertificate('${c.id}', '${c.course_name.replace(/'/g, "\\'")}', '${(c.grade_note || "").replace(/'/g, "\\'")}')">
                      ${t("Edit")}
                    </button>
                    <button class="btn btn-delete" style="font-size:0.8rem; padding:4px 10px;"
                      onclick="revokeCertificate('${c.id}')">
                      ${t("Revoke")}
                    </button>`
                }
                <button class="btn" style="font-size:0.8rem; padding:4px 10px; background:#7f1d1d; color:#fff;"
                  onclick="deleteCertificate('${c.id}')">
                  🗑 ${t("Delete")}
                </button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
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

  const { error } = await db.from("certificates").insert([{
    matric_number: matric,
    student_name: fullname,
    course_name: course_name,
    level: level,
    issued_by: "Al-Bayan Arabic Institute",
    grade_note: grade_note
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

  const container = document.getElementById("certificateModal").querySelector(".modal-content");
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

async function deleteCertificate(certId) {
  if (!confirm(t("Permanently delete this certificate?\n\nThis cannot be undone."))) return;

  console.log("Attempting to delete cert:", certId);

  const { data, error } = await db
    .from("certificates")
    .update({ deleted: true })
    .eq("id", certId)
    .select();

  console.log("Delete result:", data, error);

  if (error) {
    console.error("Delete certificate error:", error);
    alert(t("Failed to delete certificate.") + " " + error.message);
    return;
  }

  if (!data || data.length === 0) {
    alert(t("Nothing was updated — check RLS policies in Supabase."));
    return;
  }

  showToast(t("Certificate permanently deleted 🗑"));
  const { studentId, matric, fullname, level } = window.certStudentData;
  closeModal("certificateModal");
  await openCertificateModal(studentId, matric, fullname, level);
}

/* -------------------------------------------------------
   COURSES — DELETE & EDIT
------------------------------------------------------- */
async function deleteCourse(id) {
  if (!confirm(t("Delete this course? This cannot be undone."))) return;

  const { error } = await db.from("courses").delete().eq("id", id);

  if (error) {
    console.error("Delete course error:", error);
    alert(t("Failed to delete course.") + " " + error.message);
    return;
  }

  showToast(t("Course deleted ✅"));
  loadCoursesAdmin();
}

function editCourse(id, currentName, currentLevel, currentInstructor) {
  document.getElementById("courseName").value = currentName;
  document.getElementById("courseLevel").value = currentLevel;
  document.getElementById("courseInstructor").value = currentInstructor;

  window.editingCourseId = id;

  const btn = document.querySelector("[onclick='addCourse()']");
  if (btn) btn.textContent = t("Update Course");

  document.getElementById("courseName").scrollIntoView({ behavior: "smooth" });
}
