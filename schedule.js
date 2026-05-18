// ===========================
// STUDENT SCHEDULE LOGIC
// ===========================

const SUPABASE_URL = "https://cjrpjekmqrckozrbtwps.supabase.co";
  const SUPABASE_KEY = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function loadStudentSchedule() {
  const matric = sessionStorage.getItem("matric");
  if (!matric) return;

  try {
    // 1️⃣ Get student's level
    const { data: student, error: studentErr } = await sb
      .from("students")
      .select("level_arabic")
      .eq("matric_number", matric)
      .single();

    if (studentErr || !student) throw studentErr || new Error(t("Student not found"));

    const studentLevel = student.level_arabic;

    // 2️⃣ Fetch schedules for this level
    const { data: schedules, error: scheduleErr } = await sb
      .from("schedule")
      .select("*")
      .eq("level_arabic", studentLevel)
      .eq("deleted", false)
      .order("class_date", { ascending: true });

    if (scheduleErr) throw scheduleErr;

    // 3️⃣ Render schedules
    const tbody = document.querySelector("#scheduleTable");
    tbody.innerHTML = "";

    if (!schedules || schedules.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">${t("No upcoming classes")}</td></tr>`;
      return;
    }

    schedules.forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.level_arabic}</td>
        <td>${s.course}</td>
        <td>${s.instructor}</td>
        <td>${formatDate(s.class_date)}</td>
        <td>${formatTime(s.class_time)}</td>
        <td>${s.meeting_link ? `<a href="${s.meeting_link}" target="_blank" class="join-btn">${t("Join")}</a>` : t("N/A")}</td>
        <td><span class="status-badge ${s.status.toLowerCase()}">${capitalize(s.status)}</span></td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Error loading schedule:", err);
    const tbody = document.querySelector("#scheduleTable tbody");
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">${t("Failed to load schedule")}</td></tr>`;
  }
}

// ===========================
// UTILITY FUNCTIONS
// ===========================
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday:"short", year:"numeric", month:"short", day:"numeric" });
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [hour, min] = timeStr.split(":");
  return `${hour}:${min}`;
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ===========================
// INITIALIZE
// ===========================
document.addEventListener("DOMContentLoaded", loadStudentSchedule);