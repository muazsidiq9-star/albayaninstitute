const db = sb; // reuse the SAME supabase client from HTML

const gradesBody   = document.getElementById("gradesBody");
const searchInput  = document.getElementById("gradesSearch");
const filterSelect = document.getElementById("gradesFilter");

let allGrades = [];

/* --------------------------------
   STUDENT GUARD
--------------------------------- */
(function () {
  const role  = sessionStorage.getItem("role");
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
      .eq("released", true)
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
        <td colspan="9" style="text-align:center; padding:28px; color:var(--text-muted);">
          ${t("No grades found")}
        </td>
      </tr>`;
    return;
  }

  grades.forEach(g => {
    const status = (g.status || "").toLowerCase();
    gradesBody.innerHTML += `
      <tr>
        <td>${g.matric_number || "--"}</td>
        <td>${g.level_arabic  || "--"}</td>
        <td>${g.course        || "--"}</td>
        <td>${g.semester      || "--"}</td>
        <td>${g.assessment_score ?? "--"}</td>
        <td>${g.exam_score    ?? "--"}</td>
        <td>${g.total_score !== undefined ? g.total_score + "%" : "--"}</td>
        <td>${g.remark        || "--"}</td>
        <td><span class="sg-badge ${status}">${translateStatus(g.status)}</span></td>
      </tr>`;
  });
}

function translateStatus(status) {
  if (!status) return "--";
  const map = { pass: t("Pass"), average: t("Average"), fail: t("Fail") };
  return map[status.toLowerCase()] || status;
}

/* --------------------------------
   SEARCH & FILTER
--------------------------------- */
function applyFilters() {
  const text   = searchInput.value.toLowerCase();
  const filter = filterSelect.value;

  let filtered = allGrades.filter(g =>
    (g.course || "").toLowerCase().includes(text)
  );

  if (filter !== "all") {
    filtered = filtered.filter(g =>
      (g.status || "").toLowerCase() === filter
    );
  }

  renderGrades(filtered);
}

searchInput.addEventListener("input",  applyFilters);
filterSelect.addEventListener("change", applyFilters);

/* --------------------------------
   DOWNLOAD PDF
--------------------------------- */
async function downloadGradesPDF() {
  try {
    const matric = sessionStorage.getItem("matric");

    const { data: grades, error } = await sb
      .from("grades")
      .select("matric_number, level_arabic, course, semester, assessment_score, exam_score, total_score, remark, status")
      .eq("matric_number", matric);

    if (error) throw error;
    if (!grades || grades.length === 0) { alert(t("No grades to download.")); return; }

    const { data: student, error: studentErr } = await sb
      .from("students").select("fullname").eq("matric_number", matric).single();
    if (studentErr) throw studentErr;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    // Logo
    const logoImg = new Image();
    logoImg.src = "logo.png";
    await new Promise(resolve => { logoImg.onload = resolve; });
    doc.addImage(logoImg, "PNG", 14, 12, 22, 22);

    // Title
    doc.setFontSize(16); doc.setTextColor(0, 0, 0);
    doc.text("Al-Bayan Arabic Institute Online", 105, 22, { align: "center" });
    doc.setFontSize(12);
    doc.text("My Grades Report", 105, 30, { align: "center" });

    // Student info
    doc.setFontSize(10); doc.setTextColor(0, 0, 0);
    const today    = new Date().toLocaleDateString();
    const semester = grades[0]?.semester || "-";
    doc.text(`Student Name: ${student.fullname}`, 14, 48);
    doc.text(`Matric Number: ${matric}`, 14, 54);
    doc.text(`Semester: ${semester}`, 14, 60);
    doc.text(`Date: ${today}`, 150, 60);

    // Table
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

    doc.autoTable({
      startY: 68,
      margin: { left: 14, right: 14 },
      head: [["Level", "Course", "Assess.", "Exam", "Total", "Remark", "Status"]],
      body: tableData,
      tableWidth: "auto",
      styles: { fontSize: 9, cellPadding: 3, valign: "middle", halign: "center", overflow: "linebreak" },
      headStyles: { fillColor: [0, 66, 17], textColor: 255, halign: "center", fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 20 }, 1: { cellWidth: 38 }, 2: { cellWidth: 22 },
        3: { cellWidth: 18 }, 4: { cellWidth: 18 }, 5: { cellWidth: 24 }, 6: { cellWidth: 22 }
      },
      didDrawPage: function () {
        doc.setFontSize(9); doc.setTextColor(100);
        doc.text("This document is system-generated and does not require a signature.", 105, 290, { align: "center" });
      }
    });

    // Total
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.setTextColor(0, 0, 0);
    doc.text(`Total Score Sum: ${totalSum.toFixed(2)}%`, 14, finalY);

    doc.save("My_Grades.pdf");

  } catch (err) {
    console.error("PDF download error:", err);
    alert(t("Error downloading PDF. See console for details."));
  }
}

/* --------------------------------
   INIT
--------------------------------- */
document.addEventListener("DOMContentLoaded", loadStudentGrades);