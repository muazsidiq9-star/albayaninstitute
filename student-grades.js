const db = sb; // reuse the SAME supabase client from HTML

const gradesBody = document.getElementById("gradesBody");
const searchInput = document.getElementById("gradesSearch");
const filterSelect = document.getElementById("gradesFilter");

let allGrades = [];

/* --------------------------------
   STUDENT GUARD (SAME AS PROFILE)
--------------------------------- */
(function () {
  const role = sessionStorage.getItem("role");
  const matric = sessionStorage.getItem("matric");

  if (role !== "student" || !matric) {
    alert("Student login required");
    window.location.href = "login.html";
  }
})();

/* --------------------------------
   LOAD GRADES (ONLY RELEASED)
--------------------------------- */
async function loadStudentGrades() {
  try {
    const matric = sessionStorage.getItem("matric");

    const { data, error } = await db
      .from("grades")
      .select("matric_number, level_arabic, course, semester, assessment_score, exam_score, total_score, remark, status")
      .eq("matric_number", matric)
      .eq("released", true) // <-- Only fetch grades released by admin
      .order("created_at", { ascending: false });

    if (error) throw error;

    allGrades = data || [];
    renderGrades(allGrades);

  } catch (err) {
    console.error("Load grades error:", err);
  }
}

/* --------------------------------
   RENDER TABLE
--------------------------------- */
function renderGrades(grades) {
  gradesBody.innerHTML = "";

  if (grades.length === 0) {
    gradesBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;">${t("No grades found")}</td>
      </tr>
    `;
    return;
  }

  grades.forEach(g => {
    gradesBody.innerHTML += `
      <tr>
        <td>${g.matric_number}</td>
        <td>${g.level_arabic}</td>
        <td>${g.course}</td>
        <td>${g.semester}</td>
        <td>${g.assessment_score}</td>
        <td>${g.exam_score}</td>
        <td>${g.total_score}%</td>
        <td>${g.remark}</td>
        <td>${translateStatus(g.status)}</td>
      </tr>
    `;
  });
}

function translateStatus(status) {
  if (!status) return "";

  const map = {
    pass: t("Pass"),
    average: t("Average"),
    fail: t("Fail")
  };

  return map[status.toLowerCase()] || status;
}

/* --------------------------------
   SEARCH & FILTER
--------------------------------- */
function applyFilters() {
  const text = searchInput.value.toLowerCase();
  const filter = filterSelect.value;

  let filtered = allGrades.filter(g =>
    g.course.toLowerCase().includes(text)
  );

  if (filter !== "all") {
    filtered = filtered.filter(
      g => g.status.toLowerCase() === filter
    );
  }

  renderGrades(filtered);
}

searchInput.addEventListener("input", applyFilters);
filterSelect.addEventListener("change", applyFilters);

//Grades PDF
async function downloadGradesPDF() {
  try {
    // ===== Fetch grades from the table =====
    const { data: grades, error } = await sb
      .from("grades")
      .select("matric_number, level_arabic, course, semester, assessment_score, exam_score, total_score, remark, status")
      .eq("matric_number", sessionStorage.getItem("matric"));

    if (error) throw error;
    if (!grades || grades.length === 0) {
      alert("No grades to download.");
      return;
    }

    const matric = sessionStorage.getItem("matric");

const { data: student, error: studentErr } = await sb
  .from("students")
  .select("fullname")
  .eq("matric_number", matric)
  .single();

if (studentErr) throw studentErr;

const studentName = student.fullname;

    // ===== Initialize jsPDF =====
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    // ===== Add Institute Logo =====
    const logoImg = new Image();
    logoImg.src = "logo.png"; // Replace with your logo path
    await new Promise((resolve) => {
      logoImg.onload = resolve;
    });
    doc.addImage(logoImg, "PNG", 14, 12, 22, 22);

    // ===== Title =====
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Al-Bayan Arabic Institute", 105, 22, { align: "center"});
    doc.setFontSize(12);
    doc.text("My Grades Report", 105, 30, { align: "center"});

    // ===== Student Info =====
doc.setFontSize(10);
doc.setTextColor(0, 0, 0);

const matricNumber = sessionStorage.getItem("matric") || "-";
const today = new Date().toLocaleDateString();
const semester = grades[0]?.semester || "-";

doc.text(`Student Name: ${studentName}`, 14, 48);
doc.text(`Matric Number: ${matricNumber}`, 14, 54);
doc.text(`Semester: ${semester}`, 14, 60);
doc.text(`Date: ${today}`, 150, 60);

    // ===== Prepare Table Data =====
let totalSum = 0;

const tableData = grades.map(g => {
  totalSum += Number(g.total_score) || 0;

  return [
    g.level_arabic || "-",
    g.course || "-",
    g.assessment_score ?? "-",
    g.exam_score ?? "-",
    g.total_score !== undefined ? Number(g.total_score).toFixed(2) + "%" : "-",
    g.remark || "-",
    g.status === "completed" ? "Done" : g.status
  ];
});

// ===== Draw Table =====
doc.autoTable({
  startY: 68, // IMPORTANT: pushes table below student info

  margin: { left: 14, right: 14 },

  head: [["Level", "Course", "Assess.", "Exam", "Total", "Remark", "Status"]],
  body: tableData,
  tableWidth: "auto",

  styles: {
  fontSize: 9,
  cellPadding: 3,
  valign: "middle",
  halign: "center",
  overflow: "linebreak" // or try "ellipsize""
},

  headStyles: {
  fillColor: [0, 102, 204],
  textColor: 255,
  halign: "center",
  fontStyle: "bold"
},

  columnStyles: {
  0: { cellWidth: 20 }, // Level
  1: { cellWidth: 38,}, // Course
  2: { cellWidth: 22 }, // Assessment
  3: { cellWidth: 18 }, // Exam
  4: { cellWidth: 18 }, // Total
  5: { cellWidth: 24 }, // Remark
  6: { cellWidth: 22 }  // Status
},

  didDrawPage: function () {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      "This document is system-generated and does not require a signature.",
      105,
      290,
      { align: "center" }
    );
  }
});

// ===== Total Score =====
const finalY = doc.lastAutoTable.finalY + 10;

doc.setFontSize(12);
doc.setTextColor(0, 0, 0);
doc.text(`Total Score Sum: ${totalSum.toFixed(2)}%`, 14, finalY);

    /* ===== FOOTER ===== */
    y = 290;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      "This document is system-generated and does not require a signature.",
      105,
      y,
      { align: "center" }
    );

    // ===== Save PDF =====
    doc.save("My_Grades.pdf");
  } catch (err) {
    console.error("PDF download error:", err);
    alert("Error downloading PDF. See console for details.");
  }
}
/* --------------------------------
   INIT
--------------------------------- */
document.addEventListener("DOMContentLoaded", loadStudentGrades);
