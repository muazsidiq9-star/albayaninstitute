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
      .select("matric_number, level_arabic, batch, course, semester, assessment_score, exam_score, total_score, remark, status, created_at")
      .eq("matric_number", matric)
      .eq("released", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    allGrades = data || [];
    renderGrades(allGrades);
    populateSemesterSelect();
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
        <td colspan="10" style="text-align:center; padding:28px; color:var(--text-muted);">
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
        <td>${g.batch         || "--"}</td>
        <td>${g.course        || "--"}</td>
        <td>${g.semester      || "--"}</td>
        <td>${g.assessment_score ?? "--"}</td>
        <td>${g.exam_score    ?? "--"}</td>
        <td>${g.total_score !== undefined ? g.total_score : "--"}</td>
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
   SEMESTER PICKER (for the per-semester report)
   allGrades is already ordered newest-first, so the first
   occurrence of each semester in that order is the most recent.
--------------------------------- */
function populateSemesterSelect() {
  const select = document.getElementById("semesterReportSelect");
  if (!select) return;

  const semesters = [];
  allGrades.forEach(g => {
    if (g.semester && !semesters.includes(g.semester)) semesters.push(g.semester);
  });

  if (!semesters.length) {
    select.innerHTML = `<option value="">${t("No semesters available")}</option>`;
    return;
  }

  select.innerHTML = semesters.map(s => `<option value="${s}">${s}</option>`).join("");
}

/* ── Shared layout helpers (same ones used by the receipt PDF) ── */
function pdfDrawHRule(doc, y, leftX, rightX, color = [180, 151, 42]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.8);
  doc.line(leftX, y, rightX, y);
}

function pdfDrawDoubleRule(doc, y, leftX, rightX) {
  doc.setDrawColor(180, 151, 42);
  doc.setLineWidth(1.2);
  doc.line(leftX, y, rightX, y);
  doc.setLineWidth(0.4);
  doc.line(leftX, y + 4, rightX, y + 4);
}

function pdfLabel(doc, text, x, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(text.toUpperCase(), x, y);
}

function pdfValue(doc, text, x, y, maxWidth) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  if (maxWidth) {
    doc.text(text, x, y, { maxWidth });
  } else {
    doc.text(text, x, y);
  }
}

function pdfStatValue(doc, text, x, y, color, fontSize = 17) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  doc.text(text, x, y);
}

function pdfSectionLabel(doc, text, y, ML, MR) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(180, 151, 42);
  doc.text(text.toUpperCase(), ML, y);
  pdfDrawHRule(doc, y + 5, ML, MR, [212, 200, 154]);
}

function drawGradesPageChrome(doc, pw, ph, ML, MR, withWatermark = true) {
  // outer blue border — --primary-dark
  doc.setDrawColor(5, 21, 196);
  doc.setLineWidth(2.5);
  doc.roundedRect(16, 16, pw - 32, ph - 32, 4, 4, "S");

  // inner gold hairline
  doc.setDrawColor(180, 151, 42);
  doc.setLineWidth(0.7);
  doc.roundedRect(22, 22, pw - 44, ph - 44, 3, 3, "S");

  // corner ornaments
  const co = 14;
  [[34, 34], [pw - 34 - co, 34], [34, ph - 34 - co], [pw - 34 - co, ph - 34 - co]].forEach(([cx, cy]) => {
    doc.setDrawColor(180, 151, 42);
    doc.setLineWidth(0.6);
    doc.line(cx, cy, cx + co, cy);
    doc.line(cx, cy, cx, cy + co);
  });

  if (withWatermark) {
    doc.setTextColor(230, 230, 230);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    for (let wy = 120; wy < ph - 80; wy += 90) {
      for (let wx = 60; wx < pw - 40; wx += 140) {
        doc.text("Al-Bayan", wx, wy, { angle: 45 });
      }
    }
  }

  // top band — --primary-dark
  doc.setFillColor(5, 21, 196);
  doc.rect(28, 28, pw - 56, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("OFFICE OF THE H. O. D", ML, 48);
  doc.text("OFFICIAL ACADEMIC REPORT", MR, 48, { align: "right" });

  // bottom band — --primary-dark
  doc.setFillColor(5, 21, 196);
  doc.rect(28, ph - 60, pw - 56, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.text(
    "This is a computer-generated report  ·  Any alteration renders it invalid  ·  Verify via QR code",
    pw / 2, ph - 44, { align: "center" }
  );
}

/* --------------------------------
   SHARED HEADER (logo, institute name, title, meta band,
   student particulars). Returns the Y position to continue
   drawing from.
--------------------------------- */
async function renderPdfHeader(doc, pw, ph, ML, MR, { reportId, dateIssued, reportTitle, student, matric, extraParticulars = [] }) {
  drawGradesPageChrome(doc, pw, ph, ML, MR, true);

  let logoBottomY = 100;
  const logo = new Image();
  logo.src = "logo.png";
  await new Promise(resolve => {
    logo.onload = () => {
      const lw = 54;
      const lh = (logo.height / logo.width) * lw;
      doc.addImage(logo, "PNG", pw / 2 - lw / 2, 68, lw, lh);
      logoBottomY = 68 + lh + 6;
      resolve();
    };
    logo.onerror = resolve;
  });

  doc.setTextColor(5, 21, 196);        // --primary-dark
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const instName = "Al-Bayan Arabic Institute";
  const instW = doc.getTextWidth(instName);
  const maxInstW = MR - ML;
  if (instW > maxInstW) doc.setFontSize(13 * (maxInstW / instW));
  doc.text(instName, pw / 2, logoBottomY + 14, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(5, 21, 196);        // --primary-dark
  doc.text("Office of the H. O. D  -  Academic Records Division", pw / 2, logoBottomY + 28, { align: "center" });

  const ornY = logoBottomY + 40;
  pdfDrawDoubleRule(doc, ornY, ML, MR);

  doc.setTextColor(5, 21, 196);        // --primary-dark
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(reportTitle, pw / 2, ornY + 22, { align: "center" });

  const metaY = ornY + 34;
  doc.setFillColor(253, 246, 224);
  doc.rect(ML, metaY, MR - ML, 28, "F");
  doc.setDrawColor(212, 200, 154);
  doc.setLineWidth(0.5);
  doc.rect(ML, metaY, MR - ML, 28, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 80, 20);
  doc.text("REPORT ID", ML + 8, metaY + 10);
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  doc.text(reportId, ML + 8, metaY + 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 80, 20);
  doc.text("DATE ISSUED", MR - 8, metaY + 10, { align: "right" });
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  doc.text(dateIssued, MR - 8, metaY + 22, { align: "right" });

  const spY = metaY + 46;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(180, 151, 42);
  doc.text("STUDENT PARTICULARS", ML, spY);
  pdfDrawHRule(doc, spY + 5, ML, MR, [212, 200, 154]);

  const col1X = ML;
  const col2X = pw / 2 + 10;
  let gy = spY + 20;
  const rowH = 30;

  pdfLabel(doc, "Full Name", col1X, gy);
  pdfValue(doc, student.fullname, col1X, gy + 12, pw / 2 - ML - 20);
  pdfLabel(doc, "Matric Number", col2X, gy);
  pdfValue(doc, matric, col2X, gy + 12, pw / 2 - 30);
  gy += rowH;

  for (let i = 0; i < extraParticulars.length; i += 2) {
    const [l1, v1] = extraParticulars[i];
    pdfLabel(doc, l1, col1X, gy);
    pdfValue(doc, v1, col1X, gy + 12);
    if (extraParticulars[i + 1]) {
      const [l2, v2] = extraParticulars[i + 1];
      pdfLabel(doc, l2, col2X, gy);
      pdfValue(doc, v2, col2X, gy + 12);
    }
    gy += rowH;
  }

  return gy;
}

/* --------------------------------
   RESULTS SUMMARY BLOCK (sum, standing badge, average, course count)
   Page-break aware. Returns the Y position to continue from.
--------------------------------- */
function drawResultsSummary(doc, pw, ph, ML, MR, startY, { totalSum, totalCourses, avgScore, label = "Results Summary", sumLabel = "TOTAL SCORE SUM" }) {
  let finalY = startY;
  const neededHeight = 100;

  if (finalY + neededHeight > ph - 76) {
    doc.addPage();
    drawGradesPageChrome(doc, pw, ph, ML, MR, false);
    finalY = 96;
  }

  pdfSectionLabel(doc, label, finalY, ML, MR);

  const amtY = finalY + 36;
  doc.setFillColor(232, 234, 246);      // --primary-xlight
  doc.roundedRect(ML, amtY - 16, MR - ML, 38, 3, 3, "F");
  doc.setDrawColor(197, 202, 233);      // --primary-light
  doc.setLineWidth(0.5);
  doc.roundedRect(ML, amtY - 16, MR - ML, 38, 3, 3, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(5, 21, 196);        // --primary-dark
  doc.text(sumLabel, ML + 12, amtY - 4);
  doc.setFontSize(22);
  doc.text(`${totalSum.toFixed(2)}`, ML + 12, amtY + 16);

  // Standing badge keeps semantic colors (green/amber/red) — not brand colors
  const standing = avgScore >= 70 ? "EXCELLENT" : avgScore >= 50 ? "GOOD" : "REVIEW NEEDED";
  const standingColor = avgScore >= 70 ? [21, 128, 61] : avgScore >= 50 ? [146, 64, 14] : [185, 28, 28];
  doc.setFillColor(...standingColor);
  doc.roundedRect(MR - 100, amtY - 10, 92, 20, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(standing, MR - 54, amtY + 4, { align: "center" });

  let detY = amtY + 46;
  pdfLabel(doc, "Average Score", ML, detY);
  // Average Score uses the same green/amber/red as the standing badge —
  // it's the number driving that badge, so the color should match at a glance
  pdfStatValue(doc, `${avgScore.toFixed(2)}%`, ML, detY + 18, standingColor);

  pdfLabel(doc, "Total Course Results", pw / 2 + 10, detY);
  pdfStatValue(doc, String(totalCourses), pw / 2 + 10, detY + 18, [5, 21, 196]); // --primary-dark

  return detY + 34;
}

/* --------------------------------
   CLOSING MESSAGE + SIGNATURE + QR
   Page-break aware. Returns the Y position after drawing.
--------------------------------- */
async function drawClosingAndSignature(doc, pw, ph, ML, MR, startY, { matric, reportId, totalSum, student }) {
  let msgY = startY;
  const neededHeight = 140;
  if (msgY + neededHeight > ph - 76) {
    doc.addPage();
    drawGradesPageChrome(doc, pw, ph, ML, MR, false);
    msgY = 96;
  }

  pdfDrawHRule(doc, msgY, ML, MR, [212, 200, 154]);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(10.5);
  doc.setTextColor(40, 40, 40);
  doc.text(
    "This report reflects all grades currently released for the student named above as at the date of issue.\n" +
    "May Allah grant you success in your studies and increase you in beneficial knowledge.",
    pw / 2, msgY + 18,
    { align: "center", maxWidth: MR - ML }
  );

  const sigY = msgY + 70;

  const sign = new Image(); sign.src = "sign.png";
  await new Promise(resolve => {
    sign.onload  = () => { doc.addImage(sign, "PNG", ML, sigY, 150, 56); resolve(); };
    sign.onerror = resolve;
  });

  pdfDrawHRule(doc, sigY + 62, ML, ML + 160, [100, 100, 100]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(5, 21, 196);        // --primary-dark
  doc.text("Ustadh Muhammad Hassan", ML, sigY + 76);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text("H.O.D, Al-Bayan Arabic Institute", ML, sigY + 90);

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, `${matric}|${reportId}|${totalSum.toFixed(2)}|${student.fullname}`, { width: 80 });
  doc.addImage(qrCanvas.toDataURL("image/png"), "PNG", MR - 84, sigY, 72, 72);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("Scan to verify", MR - 48, sigY + 82, { align: "center" });

  return sigY + 90;
}

/* --------------------------------
   REPORT 1: SINGLE SEMESTER
   Scoped to one semester, so course rows are guaranteed unique
   by the grades_unique_student_course constraint — no cross-
   semester duplication possible here.
--------------------------------- */
async function downloadSemesterReport() {
  try {
    const matric = sessionStorage.getItem("matric");
    const semesterSelect = document.getElementById("semesterReportSelect");
    const chosenSemester = semesterSelect?.value;

    if (!chosenSemester) { alert(t("No semester available to report on.")); return; }

    const { data: grades, error } = await sb
      .from("grades")
      .select("matric_number, level_arabic, batch, course, semester, assessment_score, exam_score, total_score, remark, status")
      .eq("matric_number", matric)
      .eq("released", true)
      .eq("semester", chosenSemester);

    if (error) throw error;
    if (!grades || grades.length === 0) { alert(t("No grades to download.")); return; }

    const { data: student, error: studentErr } = await sb
      .from("students").select("fullname").eq("matric_number", matric).single();
    if (studentErr) throw studentErr;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const ML = 48;
    const MR = pw - 48;

    const reportId   = `GR-${matric}-${Date.now().toString().slice(-6)}`;
    const dateIssued  = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const levels = [...new Set(grades.map(g => g.level_arabic).filter(Boolean))];
    const levelDisplay = levels.length <= 1 ? (levels[0] || "-") : levels.join(", ");

    let gy = await renderPdfHeader(doc, pw, ph, ML, MR, {
      reportId, dateIssued,
      reportTitle: "ACADEMIC GRADES REPORT",
      student, matric,
      extraParticulars: [["Level", levelDisplay], ["Semester", chosenSemester]]
    });

    const tableLabelY = gy + 8;
    pdfSectionLabel(doc, "Academic Performance", tableLabelY, ML, MR);
    const tableStartY = tableLabelY + 20;

    let totalSum = 0;
    const tableData = grades.map(g => {
      totalSum += Number(g.total_score) || 0;
      return [
        g.level_arabic || "-",
        g.course || "-",
        g.assessment_score ?? "-",
        g.exam_score ?? "-",
        g.total_score !== undefined ? Number(g.total_score).toFixed(2) : "-",
        g.remark || "-",
        g.status === "completed" ? "Done" : (g.status || "-")
      ];
    });

    doc.autoTable({
      startY: tableStartY,
      margin: { left: ML, right: pw - MR, top: 96, bottom: 76 },
      head: [["Level", "Course", "Assess.", "Exam", "Total", "Remark", "Status"]],
      body: tableData,
      styles: {
        fontSize: 8.5, cellPadding: 5, valign: "middle", halign: "center",
        overflow: "linebreak", lineColor: [212, 200, 154], lineWidth: 0.5
      },
      headStyles: { fillColor: [5, 21, 196], textColor: 255, halign: "center", fontStyle: "bold" }, // --primary-dark
      alternateRowStyles: { fillColor: [232, 234, 246] },                                            // --primary-xlight
      columnStyles: {
        0: { cellWidth: 44 }, 1: { cellWidth: 150, halign: "left" }, 2: { cellWidth: 50 },
        3: { cellWidth: 44 }, 4: { cellWidth: 50 }, 5: { cellWidth: 74, halign: "left" }, 6: { cellWidth: 50 }
      },
      didDrawPage: function () {
        drawGradesPageChrome(doc, pw, ph, ML, MR, false);
      }
    });

    let finalY = doc.lastAutoTable.finalY + 24;

    finalY = drawResultsSummary(doc, pw, ph, ML, MR, finalY, {
      totalSum,
      totalCourses: grades.length, // safe here — one row per course within a single semester
      avgScore: totalSum / grades.length
    });

    await drawClosingAndSignature(doc, pw, ph, ML, MR, finalY, { matric, reportId, totalSum, student });

    doc.save(`Grades_${matric}_${chosenSemester.replace(/\s+/g, "_")}.pdf`);

  } catch (err) {
    console.error("Semester report PDF error:", err);
    alert(t("Error downloading PDF. See console for details."));
  }
}

/* --------------------------------
   CANONICAL ORDERING for the transcript's level/semester sections.
   Anything not in these lists falls back to the end, alphabetically,
   so an unexpected value never breaks the report — it just sorts last.
--------------------------------- */
const LEVEL_ORDER    = ["Preliminary", "Beginner", "Intermediate", "Advanced"];
const SEMESTER_ORDER = ["First", "Second"];

function sortByCanonicalOrder(values, order) {
  const known   = order.filter(o => values.includes(o));
  const unknown = values.filter(v => !order.includes(v)).sort();
  return [...known, ...unknown];
}

/* --------------------------------
   REPORT 2: FULL TRANSCRIPT
   Every released grade, grouped by Level → Semester in
   chronological order, with a cumulative summary at the end.
--------------------------------- */
async function downloadFullTranscript() {
  try {
    const matric = sessionStorage.getItem("matric");

    const { data: grades, error } = await sb
      .from("grades")
      .select("matric_number, level_arabic, course, semester, total_score, created_at")
      .eq("matric_number", matric)
      .eq("released", true)
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!grades || grades.length === 0) { alert(t("No grades to download.")); return; }

    const { data: student, error: studentErr } = await sb
      .from("students").select("fullname").eq("matric_number", matric).single();
    if (studentErr) throw studentErr;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const ML = 48;
    const MR = pw - 48;

    const reportId   = `TR-${matric}-${Date.now().toString().slice(-6)}`;
    const dateIssued  = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    let cursorY = await renderPdfHeader(doc, pw, ph, ML, MR, {
      reportId, dateIssued,
      reportTitle: "OFFICIAL ACADEMIC TRANSCRIPT",
      student, matric,
      extraParticulars: []
    });
    cursorY += 8;

    /* ── Build a Level → Course → {First, Second} matrix ──
       A course result is identified by level + semester + course,
       so the same course name appearing in two semesters becomes
       two separate cells here, never merged or averaged together. */
    const levelMap = {}; // level -> { courseOrder: [], courses: { courseName: { First: score, Second: score } } }

    grades.forEach(g => {
      const level    = g.level_arabic || "-";
      const course   = g.course || "-";
      const semester = g.semester || "-";
      const score    = Number(g.total_score) || 0;

      if (!levelMap[level]) levelMap[level] = { courseOrder: [], courses: {} };
      if (!levelMap[level].courses[course]) {
        levelMap[level].courses[course] = {};
        levelMap[level].courseOrder.push(course);
      }
      levelMap[level].courses[course][semester] = score;
    });

    // Only levels the student actually has results in appear — no empty sections
    const levels = sortByCanonicalOrder(Object.keys(levelMap), LEVEL_ORDER);

    for (const level of levels) {
      const { courseOrder, courses } = levelMap[level];

      const semestersPresent = sortByCanonicalOrder(
        [...new Set(courseOrder.flatMap(c => Object.keys(courses[c])))],
        SEMESTER_ORDER
      );

      if (cursorY + 60 > ph - 76) {
        doc.addPage();
        drawGradesPageChrome(doc, pw, ph, ML, MR, false);
        cursorY = 96;
      }

      pdfSectionLabel(doc, `Level: ${level}`, cursorY, ML, MR);
      const tableStartY = cursorY + 20;

      // Running totals per semester column, for the roll-up rows below
      const semTotals = {};
      const semCounts = {};
      semestersPresent.forEach(s => { semTotals[s] = 0; semCounts[s] = 0; });

      const bodyRows = courseOrder.map(course => {
        const row = [course];
        semestersPresent.forEach(s => {
          const val = courses[course][s];
          if (val !== undefined) {
            semTotals[s] += val;
            semCounts[s] += 1;
            row.push(val.toFixed(2));
          } else {
            row.push("—"); // course wasn't taken that semester
          }
        });
        return row;
      });

      const summaryRowStartIndex = bodyRows.length; // where roll-up rows begin

      bodyRows.push([
        "Semester Total",
        ...semestersPresent.map(s => semCounts[s] ? semTotals[s].toFixed(2) : "—")
      ]);
      bodyRows.push([
        "Semester Average",
        ...semestersPresent.map(s => semCounts[s] ? (semTotals[s] / semCounts[s]).toFixed(2) + "%" : "—")
      ]);

      const head = ["Course", ...semestersPresent.map(s => `${s} Semester`)];

      const courseColWidth = 280;
      const semColWidth = (MR - ML - courseColWidth) / semestersPresent.length;
      const columnStyles = { 0: { cellWidth: courseColWidth, halign: "left" } };
      semestersPresent.forEach((_, i) => { columnStyles[i + 1] = { cellWidth: semColWidth }; });

      doc.autoTable({
        startY: tableStartY,
        margin: { left: ML, right: pw - MR, top: 96, bottom: 76 },
        head: [head],
        body: bodyRows,
        styles: {
          fontSize: 8.5, cellPadding: 5, valign: "middle", halign: "center",
          overflow: "linebreak", lineColor: [212, 200, 154], lineWidth: 0.5
        },
        headStyles: { fillColor: [5, 21, 196], textColor: 255, halign: "center", fontStyle: "bold" },
        alternateRowStyles: { fillColor: [232, 234, 246] },
        columnStyles,
        didParseCell: function (data) {
          // Bold + gold-tinted highlight on the Semester Total / Average rows
          if (data.section === "body" && data.row.index >= summaryRowStartIndex) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [253, 246, 224];
            data.cell.styles.textColor = [5, 21, 196];
          }
        },
        didDrawPage: function () {
          drawGradesPageChrome(doc, pw, ph, ML, MR, false);
        }
      });

      cursorY = doc.lastAutoTable.finalY + 6;

      const levelTotal = semestersPresent.reduce((sum, s) => sum + semTotals[s], 0);
      const levelCount = semestersPresent.reduce((sum, s) => sum + semCounts[s], 0);
      const levelAverage = levelCount ? (levelTotal / levelCount) : 0;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(5, 21, 196);        // --primary-dark
      doc.text(`Level Average: ${levelAverage.toFixed(2)}%`, MR, cursorY + 12, { align: "right" });

      cursorY += 32;
    }

    // Cumulative summary across the whole academic history —
    // counts every grade record, not unique course names
    let totalSum = 0;
    grades.forEach(g => { totalSum += Number(g.total_score) || 0; });
    const totalCourseResults = grades.length;
    const avgScore = totalSum / totalCourseResults;

    cursorY = drawResultsSummary(doc, pw, ph, ML, MR, cursorY, {
      totalSum, totalCourses: totalCourseResults, avgScore,
      label: "Cumulative Summary", sumLabel: "CUMULATIVE SCORE SUM"
    });

    await drawClosingAndSignature(doc, pw, ph, ML, MR, cursorY, { matric, reportId, totalSum, student });

    doc.save(`Transcript_${matric}.pdf`);

  } catch (err) {
    console.error("Transcript PDF error:", err);
    alert(t("Error downloading PDF. See console for details."));
  }
}

/* --------------------------------
   INIT
--------------------------------- */
document.addEventListener("DOMContentLoaded", loadStudentGrades);